const {dialog} = require('electron').remote;
const {ipcRenderer} = require('electron');
const Handlebars = require('handlebars');

var mp3s = [];
var outputDirectory = null;

$(document).ready(function(){
    var source   = document.getElementById("mp3Template").innerHTML;
    var template = Handlebars.compile(source);

    document.querySelector('#selectBtn').addEventListener('click', function (event) {
        dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections']
        }, function (files) {
            if (files !== undefined) {
                var list = document.getElementById('selectedMp3s');
                for (var i = 0; i < files.length; i++) {
                    if (mp3s.indexOf(files[i]) === -1) {
                        mp3s.push(files[i]);
                        var context = {id: i, mp3Path: files[i]};
                        var html = template(context);
                        $("#mp3List").append(html);
                    }
                }
            }
        });
    });

    document.querySelector('#outputDirectory').addEventListener('click', function (event) {
        dialog.showOpenDialog({
            properties: ['openDirectory']
        }, function (directory) {
            if (directory !== undefined) {
                outputDirectory = directory;
                $("#outputDirectoryDisplay").html("Your output directory is <strong>" + directory + "</strong>");
                $("#tools").show();
            }
        });
    });

    document.querySelector('#convert').addEventListener('click', function (event) {
        $("#messages").html("Converting MP3s, please be patient...");
        var result = ipcRenderer.sendSync('tempo',{ "mp3s": mp3s, "bpm": $("#bpm").val(), "directory": outputDirectory});
        if (result === true) {
            $("#messages").html("Files converted!");
        } else {
            $("#messages").html("Could not convert files :(");
        }
    });
});