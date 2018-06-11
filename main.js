const {app, BrowserWindow} = require('electron')
var AudioContext = require('web-audio-api').AudioContext
context = new AudioContext
var fs = require('fs')
var ffbinaries = require('ffbinaries');

let win;

function createWindow() {
  win = new BrowserWindow({ width: 800, height: 600});
  win.loadFile('index.html');
  win.webContents.openDevTools();
  downloadFfBinaries();
}

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

/** FUNCTIONS **/
function downloadFfBinaries() {
  console.log(ffbinaries.locateBinariesSync(['ffmpeg']));
}

function decodeMp3(mp3){
  console.log("Decoding " + mp3)
  fs.readFile(mp3, function(err, buf) {
    if (err) throw err
    context.decodeAudioData(buf, function(audioBuffer) {
      console.log("Channels: " + audioBuffer.numberOfChannels);
      console.log("Frame Length: " + audioBuffer.length);
      console.log("Sample Rate: " + audioBuffer.sampleRate);
      console.log("Duration (Seconds): " + audioBuffer.duration);
      var pcmData = (audioBuffer.getChannelData(0));
      var start = findPeaks(pcmData, audioBuffer);
      console.log(start);
    }, function(err) { throw err })
  })
}

function findPeaks(pcmData, audioBuffer) {
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