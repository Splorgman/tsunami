const {dialog} = require('electron').remote;

var mp3s = [];

document.querySelector('#selectBtn').addEventListener('click', function (event) {
    dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections']
    }, function (files) {
        if (files !== undefined) {
        	var list = document.getElementById('selectedMp3s');
            for (var i = 0; i < files.length; i++) {
            	if (mp3s.indexOf(files[i]) === -1) {
            		mp3s.push(files[i]);
            		list.innerHTML += "<p>" + files[i] + "</p>";
            	}
            }
        }
    });
});

document.querySelector('#convert').addEventListener('click', function (event) {
	alert("We are going to convert your MP3s!");
});