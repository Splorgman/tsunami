var AudioContext = require('web-audio-api').AudioContext
context = new AudioContext
var fs = require('fs')
var exec = require('child_process').exec;
var _ = require('underscore');

var pcmdata = [] ;

decodeMp3("black.mp3");


function decodeMp3(mp3){
  console.log("Decoding " + mp3)
  fs.readFile(mp3, function(err, buf) {
    if (err) throw err
    context.decodeAudioData(buf, function(audioBuffer) {
      console.log("Channels: " + audioBuffer.numberOfChannels);
      console.log("Frame Length: " + audioBuffer.length);
      console.log("Sample Rate: " + audioBuffer.sampleRate);
      console.log("Duration (Seconds): " + audioBuffer.duration);
      pcmData = (audioBuffer.getChannelData(0));
      var peaks = findPeaks(pcmData, audioBuffer);
      console.log(peaks);
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
    if (firstNoiseTime === 0) {
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

  return peaks;
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