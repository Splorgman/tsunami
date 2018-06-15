const {dialog} = require('electron').remote;
const {ipcRenderer} = require('electron');
const Handlebars = require('handlebars');

var mp3s = [];
var outputDirectory = null;

$(document).ready(function(){
    var source   = document.getElementById("mp3Template").innerHTML;
    var template = Handlebars.compile(source);

    document.querySelector('#selectBtn').addEventListener('click', function (event) {
        $("#messages").html('');
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
                        var position = mp3s.length - 1;
                        var context = {id: position, mp3id: "mp3" + position, mp3StatusID: "mp3Status" + position, mp3Path: files[i]};
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
        var count = 0;
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
                console.log(arg);
                var position = arg.position;
                if (arg.status == "tempo-complete") {
                    $("#mp3Status" + position).html("Tempo adjustment complete!");
                } else if (arg.status == "tempo-start") {
                    $("#mp3Status" + position).html("Starting tempo adjustment...");
                } else if (arg.status == "offset-start") {
                    $("#mp3Status" + position).html("Starting offset calculation...");
                } else if (arg.status == "offset-complete") {
                    $("#mp3Status" + position).html("Offset adjustment complete!");
                    count = count + 1;
                }

                if (count == mp3s.length) {
                    $(".btn").prop('disabled',false);
                    $("#mp3List").html('');
                    $("#messages").html("All MP3s converted!");
                }
            });

            $(".btn").prop('disabled',true);
            ipcRenderer.send('tempo', { "mp3s": mp3s, "bpm": parseInt($("#bpm").val()), "directory": outputDirectory});
        }
    });
});