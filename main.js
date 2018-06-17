var fs = require('fs-extra')
var ffbinaries = require('ffbinaries');
var nodeid3 = require('node-id3');
var bluebird = require('bluebird');
var spawn = require('child_process').spawn;
var AudioContext = require('web-audio-api').AudioContext
var context = new AudioContext
var nodeid3 = require('node-id3');

const { exec } = require('child_process');
const {app, BrowserWindow, ipcMain} = require('electron')

let win;

var runningProcesses = 0;
var runningOffsetProcesses = 0;

/** INITIAL SETUP **/
app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
});

app.on('activate', () => {
  if (win === null) {
    createWindow();
  }
});

/** EVENTS **/
ipcMain.on('tempo', (event, arg) => {
  for (var i = 0; i < arg.mp3s.length; i++) {
    var result = adjustTempo(arg.mp3s[i], arg.bpm, arg.directory, event, i);
  }
});

/** FUNCTIONS **/
function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 1024});
  win.setMenu(null);
  win.loadFile('index.html');
  //win.webContents.openDevTools();
  downloadFfBinaries();
}

function adjustTempo(file, bpm, directory, event, position) {
  if (runningProcesses < 2) {
    runningProcesses += 1;
    console.log('\x1b[36m',"Converting " + file);
    var tags = nodeid3.read(file, function(err, tags) {
      var outputPath = directory + "/" + tags.artist + ' - ' + tags.title + '.mp3';
      var existingBpm = tags.bpm;
      //TODO: this is an invalid test, need to figure out how to actually find an MP3 with no BPM set.
      if (existingBpm == '') {
        event.sender.send('tempo-reply', { position: position, status: 'no-bpm' });
        runningProcesses -= 1;
        return;
      }

      if (existingBpm != bpm) {
        console.log("Existing BPM is " + existingBpm + ", updating to " + bpm);

        var tempoChange = bpm / existingBpm;
        
        console.log("Tempo change is " + tempoChange + ', writing to ' + outputPath);

        var args = [
          '-i', file,
          '-filter:a', 'atempo=' + tempoChange,
          outputPath
        ];

        var ffmpegPath = ffbinaries.getBinaryFilename('ffmpeg');

        console.log("Running " + ffmpegPath + ' -y -i "' + file + '" -vsync 2 -q:a 0 -filter:a "atempo=' + tempoChange + '" -vn "' + outputPath + '"');

        event.sender.send('tempo-reply', { position: position, status: 'tempo-start' });
        const child = exec(ffmpegPath + ' -y -i "' + file + '" -vsync 2 -q:a 0 -filter:a "atempo=' + tempoChange + '" -vn "' + outputPath + '"');

        child.on('error', function (err) {
          console.log("Error caught when executing ffmpeg");
          console.log(err);
          runningProcesses -= 1;
          event.sender.send('tempo-reply', { position: position, status: 'failed' });
        });

        child.on('exit', function (code, signal) {
          runningProcesses -= 1;
          if (signal === null) {
            event.sender.send('tempo-reply', { position: position, status: 'tempo-complete' });
            console.log("Signal was null, rewriting offset");
            var newTags = {
              "bpm": bpm,
              "APIC": tags.raw.APIC
            }

            var success = nodeid3.update(newTags, outputPath);
            if (success !== true) {
              console.log('\x1b[31m',"Failed to update " + outputPath);
            }
            setTimeout(function(){
              rewriteOffset(outputPath, event, position);
            },3000);
          } else {
            console.log("SIGNAL WAS NOT NULL!");
          }
        });
      } else {
        runningProcesses -= 1;
        console.log("Copying " + file + " to " + outputPath);
        fs.copyFile(file, outputPath, (err) => {
          if (err) {
            console.log("Error copying file: " + err);
          }
          setTimeout(function(){
            rewriteOffset(outputPath, event, position);
          },3000);
        });
      }
    });
  } else {
    console.log("Queueing conversion");
    setTimeout(function() {
      adjustTempo(file, bpm, directory, event, position); 
    }, 5000);
  }
  
}

function rewriteOffset(file, event, position) {
  event.sender.send('tempo-reply', { position: position, status: 'offset-start' });
  var tags = {
    "COMM": {
      "language": "eng",
      "text": 'PENDING OFFSET REWRITE'
    }
  }

  var success = nodeid3.update(tags, file);
  calculateAndWriteOffset(file, event, position);
}

function calculateAndWriteOffset(mp3, event, position) {
  if (runningOffsetProcesses < 2) {
    runningOffsetProcesses += 1;
    console.log("Decoding " + mp3)
    fs.readFile(mp3, function(err, buf) {
      if (err) throw err
      context.decodeAudioData(buf, function(audioBuffer) {
        console.log("Channels: " + audioBuffer.numberOfChannels);
        console.log("Frame Length: " + audioBuffer.length);
        console.log("Sample Rate: " + audioBuffer.sampleRate);
        console.log("Duration (Seconds): " + audioBuffer.duration);
        var pcmData = (audioBuffer.getChannelData(0));
        var start = findStart(pcmData, audioBuffer);
        console.log(start);
        var tags = {
          "COMM": {
            "language": "eng",
            "text": '{"Offset": ' + start + '}'
          }
        }

        console.log("Setting offset to " + start + " on " + mp3);
        var success = nodeid3.update(tags, mp3);
        console.log("Offset write complete for " + mp3);
        event.sender.send('tempo-reply', { position: position, status: 'offset-complete' });

        if (success !== true) {
          console.log('\x1b[31m',"Failed to update " + mp3);
          runningOffsetProcesses -= 1; 
          return false;
        }
        else {
          runningOffsetProcesses -= 1; 
          return true;
        }
      }, function(err) { 
        console.log("Error when writing offset for " + mp3);
        console.log(err);
        event.sender.send('tempo-reply', { position: position, status: 'offset-complete' });
        runningOffsetProcesses -= 1; 
        throw err 
      });
    });
  } else {
    console.log("Queueing offset calculation");
    setTimeout(function() {
      calculateAndWriteOffset(mp3, event, position);
    }, 5000);
  }
  
}

function findStart(pcmData, audioBuffer) {
  var levels = getLevels(pcmData, audioBuffer, 10);

  var firstNoiseTime = 0;
  var firstNoiseLevel = 0;

  var peaks = [];
  var previousVolume = 0;
  var threshold = 0.3;

  for (var i = 0; i < levels.length; i++) {
    if (firstNoiseTime === 0 && levels[i].value > 0.01) {
      firstNoiseTime = levels[i].time;
      firstNoiseLevel = levels[i].value;
    }

    var currentVolume = levels[i].value;
    if (currentVolume-previousVolume >= threshold) {
      peaks.push({
        "time": levels[i].time,
        "level": currentVolume
      })
    }
    previousVolume = currentVolume;
  }

  if (peaks[0].time - firstNoiseTime > 5000) {
      var start = firstNoiseTime;
  } else {
    var start = peaks[0].time;
  }

  return start;
}

function getLevels(pcmData, audioBuffer, interval) {
  var step = Math.round((audioBuffer.sampleRate/1000) * interval);

  var levels = [];

  var stepCounter = 0;
  var previousVolume = 0;
  var time = 0;

  var i = 0;
  while (i <= audioBuffer.length) {
    while (stepCounter <= step) {
      if (stepCounter > audioBuffer.length) {
        break;
      }

      if (pcmData[i] !== undefined) {
        var volume = pcmData[i].toFixed(5);

        if (volume > previousVolume) {
          previousVolume = volume;
          time = Math.round((levels.length * interval) + ((10/step)*stepCounter));
        }
      }
      stepCounter++;
      i++;
    }

    levels.push({
      "time": time,
      "value": previousVolume
    });

    previousVolume = 0;
    stepCounter = 0;
  }
  return levels;
}

function downloadFfBinaries() {
  ffbinaries.downloadBinaries(['ffmpeg', {}], function() {
    console.log("Downloaded ffmpeg");
  });
}