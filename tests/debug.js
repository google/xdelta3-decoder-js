
var debug_text = '';

function printf(text) {
  var last = text.length - 1;
  if (text[last] == '\n') {
    //console.log(text.substr(0,last));
    console.log(text);
  } else {
    console.log(text);
  }
  debug_text += text;
}

function debug_save(){
  var filename = 'debug.log';

  var blob = new Blob([debug_text], {type: 'text/json'}),
    e = document.createEvent('MouseEvents'),
    a = document.createElement('a')

  a.download = filename
  a.href = window.URL.createObjectURL(blob)
  a.dataset.downloadurl =  ['text/json', a.download, a.href].join(':')
  e.initMouseEvent('click', true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null)
  a.dispatchEvent(e)

  debug_text = '';
}

function dumpBytes(bytes, offset, length) {
  printf('++++++++++++++++++++++++++++++++++++++++++\n');
  var output = '';
  var text = '';
  for (var i = 0; i < length; i++) {
    var aByte = bytes[offset + i];
    var dec = '  ' + aByte;
    if (aByte >= 32 && aByte < 127) {
      text += String.fromCharCode(aByte);
    } else {
      text += ' ';
    }
    output += dec.substr(-3) + ', ';
    if (i % 8 == 7) {
      output += ' // \'' + text + '\'\n';
      text = '';
    }
  }
  i--;
  if (i % 8 != 7) {
    output += ' // \'' + text + '\'\n';
  }
  printf(output);
  printf('++++++++++++++++++++++++++++++++++++++++++\n');
}

/**
 * @param {!xd3_hinst} inst1
 * @param {!xd3_hinst} inst2
 */
function printInstructionPair(inst1, inst2) {
  printf(
      typeToTypeString(inst1.type) + '/' + inst1.size + '/' + typeToMode(inst1.type) + ' : ' +
      typeToTypeString(inst2.type) + '/' + inst2.size + '/' + typeToMode(inst2.type) + "\n");
}

function dumpCodeTableRows(tableRows, startRow, endRow) {
  var output = '';
  output += '==============================================\n';
  output += 'code table:\n';
  for (var row = startRow; row < endRow; row++) {
    var tableRow = tableRows[row];
    output += rightJustify(row, 3) + ': ';
    output += typeToTypeString(tableRow.type1) + '(' + tableRow.type1 + '), ';
    output += rightJustify(tableRow.size1, 2) + ', ';
    output += typeToMode(tableRow.type1) + ', ';
    output += typeToTypeString(tableRow.type2) + '(' + tableRow.type2 + '), ';
    output += rightJustify(tableRow.size2, 2) + ', ';
    output += typeToMode(tableRow.type2);
    output += '\n';
  }
  output += '==============================================\n';
  printf(output);
}

// TODO(bstell): move to a common file
var XD3_NOOP = 0;
var XD3_ADD = 1;
var XD3_RUN = 2;
var XD3_CPY = 3;

function typeToMode(type) {
  if (type == XD3_NOOP) {
    return 0;
  }
  else if (type == XD3_ADD) {
    return 0;
  }
  else if (type == XD3_RUN) {
    return 0;
  }
  else {
    return type - XD3_CPY;
  }
}

function typeToTypeString(type) {
  var typeString;
  if (type == XD3_NOOP) {
    typeString = 'XD3_NOOP';
  }
  else if (type == XD3_ADD) {
    typeString = 'XD3_ADD';
  }
  else if (type == XD3_RUN) {
    typeString = 'XD3_RUN';
  }
  else {
    typeString = 'XD3_CPY';
  }
  return typeString;
}

function rightJustify(str, len) {
  var longStr = '          ' + str;
  return longStr.substr(-len);
}

function toHexStr(val) {
  var hex = '0' + val.toString(16);
  return '0x' + hex.substr(-2);
}

