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
            properties: ['openFile', 'multiSelections'],
            filters: [
                {
                    name: "MP3s", extensions: ['mp3']
                }
            ]
        }, function (files) {
            if (files !== undefined) {
                var list = document.getElementById('selectedMp3s');
                for (var i = 0; i < files.length; i++) {
                    if (mp3s.indexOf(files[i]) === -1) {
                        mp3s.push(files[i]);
                        var context = {id: i, mp3id: "mp3" + i, mp3StatusID: "mp3Status" + i, mp3Path: files[i]};
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
        $("#messages").html('');
        if ($("#bpm").val() == '' || parseInt($("#bpm").val()) < 80 || parseInt($("#bpm").val()) > 200) {
            alert("Please select a BPM between 80 and 200.");
            event.preventDefault(); 
        }
        else if (outputDirectory === null) {
            alert("You must first set your output directory.");
            event.preventDefault(); 
        } else {
            for (var i = 0; i < mp3s.length; i++) {
                $("#mp3Status" + i).html("Queued for conversion...");
            }
            ipcRenderer.on('tempo-reply', (event, arg) => {
                var position = arg.position;
                if (arg.status == "tempo-complete") {
                    $("#mp3Status" + position).html("Tempo adjustment complete!");
                } else if (arg.status == "offset-start") {
                    $("#mp3Status" + position).html("Starting offset calculation...");
                } else if (arg.status == "offset-complete") {
                    $("#mp3Status" + position).html("Offset adjustment complete!");
                }
            });

            $(".btn").prop('disabled',true);
            ipcRenderer.send('tempo', { "mp3s": mp3s, "bpm": parseInt($("#bpm").val()), "directory": outputDirectory});
        }
    });
});