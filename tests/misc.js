
  function setInnerHtml(id, message) {
    var msgEle = document.getElementById(id);
    msgEle.innerHTML = message;
    console.log(message);
  }

  function compareBytes(bytesA, bytesB) {
    var msg;
    var length = bytesB.byteLength;
    for (var i = 0; i < length; i++) {
      if (bytesA[i] != bytesB[i]) {
        return i +': bytesA('+bytesA[i]+') != bytesB('+bytesB[i]+')';
      }
    }
    return 'matched!';
  }

  // Load a file.
  function loadFile(url, callback) {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4) {
        if (this.status == 200) {
          callback(new Uint8Array(this.response));
        }
      }
    };
    xhttp.open("GET", url, true);
    xhttp.responseType = "arraybuffer";
    xhttp.send();
  }

  function addRow(id, name, path) {
    var msgEle = document.getElementById(id);
    msgEle.innerHTML += '<tr><td align="right">' + name + ':</td><td>' + path + '</td></tr>';
  }
