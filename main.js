const {app, BrowserWindow, ipcMain} = require('electron')
var AudioContext = require('web-audio-api').AudioContext
context = new AudioContext
var fs = require('fs')
var ffbinaries = require('ffbinaries');
var nodeid3 = require('node-id3');
var exec = require('child_process').execSync;

let win;

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
    var result = adjustTempo(arg.mp3s[i], arg.bpm, arg.directory);
  }
  console.log(arg);
  event.returnValue = true; //todo: fix this
});

/** FUNCTIONS **/
function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 1024});
  win.loadFile('index.html');
  win.webContents.openDevTools();
  downloadFfBinaries();
}

function adjustTempo(file, bpm, directory) {
  console.log('\x1b[36m',"Converting " + file);
  var tags = nodeid3.read(file, function(err, tags) {
    var outputPath = directory + "/" + tags.artist + ' - ' + tags.title + '.mp3';
    var existingBpm = tags.bpm;

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

      exec(ffmpegPath + ' -y -i "' + file + '" -vsync 2 -q:a 0 -filter:a "atempo=' + tempoChange + '" -vn "' + outputPath + '"', (error, stdout, stderr) => {
        if (error) {
          console.error('Error: ' + error);
          return;
        }
      });

      //I rewrite the album art here, because ffmpeg seems to chew it up.
      var newTags = {
        "bpm": bpm,
        "APIC": tags.raw.APIC
      }

      var success = nodeid3.update(newTags, outputPath);
      if (success !== true) {
        console.log('\x1b[31m',"Failed to update " + outputPath);
      }

      findAndSetOffset(outputPath);

    } else {
      console.log("Copying " + file + " to " + outputPath);
      fs.copySync(file, outputPath);
    }
  });
}

function downloadFfBinaries() {
  ffbinaries.downloadBinaries(['ffmpeg', {}], function() {
    console.log("Downloaded ffmpeg");
  });
}

function findAndSetOffset(mp3){
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

        var success = nodeid3.update(tags, mp3);
        if (success !== true) {
          console.log('\x1b[31m',"Failed to update " + mp3);
        }
    }, function(err) { throw err })
  })
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