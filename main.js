var fs = require('fs-extra')
var ffbinaries = require('ffbinaries');
var nodeid3 = require('node-id3');
var bluebird = require('bluebird');
var spawn = require('child_process').spawn;

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
        console.log("Copying " + file + " to " + outputPath);
        fs.copySync(file, outputPath);
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
  if (runningOffsetProcesses < 2) {
    var process = spawn('node', ['./offset.js', file]);
    process.on('exit', function() {
      event.sender.send('tempo-reply', { position: position, status: 'offset-complete' });
    })
  } else {
    console.log("Queueing offset calculation");
    setTimeout(function() {
      rewriteOffset(file, event, position);
    }, 5000);
  }
}

function downloadFfBinaries() {
  ffbinaries.downloadBinaries(['ffmpeg', {}], function() {
    console.log("Downloaded ffmpeg");
  });
}