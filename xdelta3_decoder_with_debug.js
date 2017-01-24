'use strict';
/**
 * xdelta3 - delta compression tools and library
 * Copyright 2016 Joshua MacDonald
 *
 * Copyright (C) 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010,
 * 2011, 2012, 2013, 2014, 2015 josh.macdonald@gmail.com
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview This file implements XDelta3 decoding.
 * Note: the subroutine, method, field, and variable names do not follow
 * Javascript style guide but reflect the names in the XDelta3 C++ files. This
 * makes is to make it easier to keep this code in synch with the C++ code.
 *
 * The C++ code is very casual about initializing and accessing data structures.
 * This code is a port and follows that code style.
 */

(function() {

  // Check for namespace collision.
  if ((typeof window['XDelta3Decoder'] != 'undefined')
      || (typeof window.XDelta3Decoder != 'undefined')) {
    throw new Error('XDelta3Decoder already defined.');
  }

  /**
   * The public class.
   */
  window.XDelta3Decoder = function(debugOutput) {  //
  };

  var XDelta3Decoder = window.XDelta3Decoder;

  /**
   * The public API to decode a delta possibly with a source.
   * @param {!Uint8Array} delta The Xdelta delta file.
   * @param {Uint8Array=} opt_source The source file (optional).
   * @return {!ArrayBuffer}
   */
  XDelta3Decoder.decode = function(delta, opt_source) {
    if (typeof opt_source != 'object') {
      opt_source = null;
    }
    var xdelta3 = new _XDelta3Decoder(delta, opt_source);
    var uint8Bytes = xdelta3.xd3_decode_input();
    return uint8Bytes.buffer;
  }

  /**
   * The public API to disable debug printf code.
   */
  XDelta3Decoder.disableDebug = function() {  // DEBUG ONLY
    for (var i = 0; i < fallbackRoutines.length; i++) {  // DEBUG ONLY
      var name = fallbackRoutines[i];  // DEBUG ONLY
      window[name] = function() {};  // DEBUG ONLY
    }  // DEBUG ONLY
  }  // DEBUG ONLY

  // Define debug fallback routines if needed.
  var fallbackRoutines = [  // DEBUG ONLY
      'dumpBytes',  // DEBUG ONLY
      'dumpCodeTableRows',  // DEBUG ONLY
      'printf',  // DEBUG ONLY
      'printInstructionPair',  // DEBUG ONLY
      'toHexStr'  // DEBUG ONLY
  ];  // DEBUG ONLY
  for (var i = 0; i < fallbackRoutines.length; i++) {  // DEBUG ONLY
    var name = fallbackRoutines[i];  // DEBUG ONLY
    if (typeof window[name] == 'undefined') {  // DEBUG ONLY
      window[name] = function() {};  // DEBUG ONLY
    }  // DEBUG ONLY
  }  // DEBUG ONLY

  /**
   * The XDelta3 data commands.
   */
  /** @type {number} */
  var XD3_NOOP = 0;
  /** @type {number} */
  var XD3_ADD = 1;
  /** @type {number} */
  var XD3_RUN = 2;
  /** @type {number} */
  var XD3_CPY = 3;

  /** @type {number} */
  var MIN_MATCH = 4;

  /**
   * Header indicator bits.
   */
  /** @type {number} */
  var VCD_SECONDARY = 1;
  /** @type {number} */
  var VCD_CODETABLE = 2;
  /** @type {number} */
  var VCD_APPHEADER = 4;
  /** @type {number} */
  var VCD_INVHDR = ~(VCD_SECONDARY | VCD_CODETABLE | VCD_APPHEADER);

  var VCD_SOURCE = 0x01;
  var VCD_TARGET = 0x02;
  var VCD_ADLER32 = 0x04;


  /**
   * Declares the main decode class.
   * @param {!Uint8Array} delta The Xdelta3 delta file.
   * @param {Uint8Array=} opt_source The source file (optional).
   * @constructor
   */
  function _XDelta3Decoder(delta, opt_source) {
    /** @type {!Uint8Array} */
    this.delta = delta;

    var source = opt_source || new Uint8Array(1);
    /** @type {!DataObject} */
    this.source = new DataObject(source);

    /** @type {!xd3_source} */
    this.src = new xd3_source();

    /** @type {number} */
    this.position = 0;

    /** @type {number} */
    this.dec_window_count = 0;

    /** @type {number} */
    this.dec_winstart = 0;

    /**
     * The length of the target window.
     * @type {number}
     */
    this.dec_tgtlen = 0;

    /**
     * The Alder32 checksum. This is used to verify the decoded bytes checksum
     * matches the checksum of the original.
     */
    this.dec_adler32 = 0;

    /**
     * First half instruction.
     * @type {!xd3_hinst}
     */
    this.dec_current1 = new xd3_hinst();

    /**
     * Second half instruction.
     * @type {!xd3_hinst}
     */
    this.dec_current2 = new xd3_hinst();

    /** @type {!xd3_desect} */
    this.data_sect = new xd3_desect();

    /** @type {!xd3_desect} */
    this.inst_sect = new xd3_desect();

    /** @type {!xd3_desect} */
    this.addr_sect = new xd3_desect();

    /**
     * The address cache.
     * @type {!xd3_addr_cache}
     */
    this.acache = new xd3_addr_cache(
        __rfc3284_code_table_desc.near_modes,
        __rfc3284_code_table_desc.same_modes);
  }

  /**
   * Allocates the address caches.
   */
  _XDelta3Decoder.prototype.xd3_alloc_cache = function() {
    printf("xd3_alloc_cache\n");  // DEBUG ONLY
    this.acache.near_array = null;  // not sure this is needed
    this.acache.same_array = null;  // not sure this is needed
    if (this.acache.s_near > 0) {
      this.acache.near_array = allocArray(this.acache.s_near, 0);
    }
    if (this.acache.s_same > 0) {
      this.acache.same_array = allocArray(this.acache.s_same * 256, 0);
    }
  };

  /**
   * Parses the delta file data and produces the targetWindow data.
   * @return {!Uint8Array}
   */
  _XDelta3Decoder.prototype.xd3_decode_input = function() {
    printf("==================================\n");  // DEBUG ONLY
    printf("    HEADER pos = " + this.position + "\n");  // DEBUG ONLY
    printf("==================================\n");  // DEBUG ONLY
    printf("DEC_VCHEAD: load magic bytes\n");  // DEBUG ONLY
    dumpBytes(this.delta, 0, 4);  // DEBUG ONLY

    printf("DEC_VCHEAD: check magic bytes\n");  // DEBUG ONLY
    if (this.delta[0] != 0xD6 ||  // 'V' with MSB set
        this.delta[1] != 0xC3 ||  // 'C' with MSB set
        this.delta[2] != 0xC4 ||  // 'D' with MSB set
        this.delta[3] != 0) {     // unused but be set to zero
      throw new Error('XD3_INVALID_INPUT invalid magic');
    }
    this.position = 4;

    this.dec_hdr_ind = this.delta[this.position++];
    printf("DEC_HDRIND: dec_hdr_ind = " + toHexStr(this.dec_hdr_ind) + "\n");  // DEBUG ONLY
    if (this.dec_hdr_ind & VCD_INVHDR) {
      throw new Error('VCD_INVHDR unrecognized header indicator bits set');
    }

    printf("DEC_SECONDID: read byte if VCD_SECONDARY(" + (this.dec_hdr_ind & VCD_SECONDARY) + ")\n");  // DEBUG ONLY
    if (this.dec_hdr_ind & VCD_SECONDARY) {
      throw new Error('VCD_SECONDARY not implemented');
    }
    printf("DEC_TABLEN: read size if VCD_CODETABLE(" + (this.dec_hdr_ind & VCD_CODETABLE) + ")\n");  // DEBUG ONLY
    printf("DEC_NEAR: read byte if VCD_CODETABLE(" + (this.dec_hdr_ind & VCD_CODETABLE) + ")\n");  // DEBUG ONLY
    printf("DEC_SAME: read byte if VCD_CODETABLE(" + (this.dec_hdr_ind & VCD_CODETABLE) + ")\n");  // DEBUG ONLY

    if (this.dec_hdr_ind & VCD_CODETABLE) {
      throw new Error('VCD_CODETABLE support was removed');
    } else {
      printf("use the default table.\n");  // DEBUG ONLY
      /* Use the default table. */
      printf("use default table near_modes " + __rfc3284_code_table_desc.near_modes + "\n");  // DEBUG ONLY
      this.acache.s_near = __rfc3284_code_table_desc.near_modes;
      printf("use default table same_modes " + __rfc3284_code_table_desc.same_modes + "\n");  // DEBUG ONLY
      this.acache.s_same = __rfc3284_code_table_desc.same_modes;
      this.code_table = xd3_rfc3284_code_table();
    }

    this.xd3_alloc_cache();

    printf("DEC_APPLEN: read size if VCD_APPHEADER(" + (this.dec_hdr_ind & VCD_APPHEADER)  // DEBUG ONLY
        + ")\n");  // DEBUG ONLY
    if (this.dec_hdr_ind & VCD_APPHEADER) {
      this.dec_appheadsz = this.getInteger();
      printf("dec_appheadsz = " + this.dec_appheadsz + "\n");  // DEBUG ONLY
      printf("DEC_APPDAT: \n");  // DEBUG ONLY
      // Note: appHeader does not have a 0-termination.
      this.dec_apphead = this.xd3_alloc(this.dec_appheadsz + 1);
      this.xd3_decode_bytes(this.dec_apphead, 0, this.dec_appheadsz);
      this.dec_apphead[this.dec_appheadsz + 1] = 0;
      dumpBytes(this.dec_apphead, 0, this.dec_appheadsz + 1);  // DEBUG ONLY
    }
    printf("pos after dec_appheader = " + this.position + "\n\n");  // DEBUG ONLY

    //var targetLength = 0;
    while (true) {
      printf("DEC_WININD\n");  // DEBUG ONLY
      printf("==================================\n");  // DEBUG ONLY
      printf("    WINDOW pos = "+this.position+"\n");  // DEBUG ONLY
      printf("==================================\n");  // DEBUG ONLY
      if (this.position >= this.delta.length) {
        break;
      }
      //targetLength +=
      this.handleWindow();
    }
    printf("no more data\n");  // DEBUG ONLY
    return this.dec_buffer.bytes;
  };

  _XDelta3Decoder.prototype.xd3_decode_init_window = function() {
    this.dec_cpylen = 0;
    this.dec_cpyoff = 0;
    // this.dec_cksumbytes = 0;

    xd3_init_cache(this.acache);
  }

  _XDelta3Decoder.prototype.handleWindow = function() {
    this.dec_win_ind = this.delta[this.position++];  // DEC_WININD
    printf("dec_win_ind = " + this.dec_win_ind + "(" + toHexStr(this.dec_win_ind) + ")\n");  // DEBUG ONLY
    printf("dec_tgtlen = " + this.dec_tgtlen + "(" + toHexStr(this.dec_tgtlen) + ")\n");  // DEBUG ONLY

    if (this.dec_win_ind & ~7) {
      throw new Error('VCD_INVWIN unexpected bits set');
    }

    printf("window_count = " + this.dec_window_count + "\n");  // DEBUG ONLY
    this.current_window = this.dec_window_count;

    this.dec_winstart += this.dec_tgtlen;
    printf("dec_winstart = " + this.dec_winstart + "\n");  // DEBUG ONLY

    printf('xd3_decode_init_window\n');  // DEBUG ONLY
    this.xd3_decode_init_window();
    var SRCORTGT = VCD_SOURCE | VCD_TARGET;
    var srcortgt = SRCORTGT & this.dec_win_ind;
    printf("srcortgt = " + srcortgt + "\n");  // DEBUG ONLY

    // If using a source or target data segment: read the lenght and position
    // integers.
    printf("DEC_CPYLEN: dec_cpylen = "+this.dec_cpylen+"\n");  // DEBUG ONLY
    printf("DEC_CPYLEN: get size if SRCORTGT("+srcortgt+"), pos = "+this.position+"\n");  // DEBUG ONLY
    if (srcortgt) {
      this.dec_cpylen = this.getInteger();  // DEC_CPYLEN
      printf("dec_cpylen = " + this.dec_cpylen + "\n");  // DEBUG ONLY
    }
    this.dec_position = this.dec_cpylen;
    printf("DEC_CPYOFF: get size if SRCORTGT("+srcortgt+"), pos = "+this.position+"\n");  // DEBUG ONLY
    if (srcortgt) {
      var sourcePosition = this.getInteger();  // DEC_CPYOFF
      this.dec_cpyoff = sourcePosition;
      printf("dec_cpyoff = " + this.dec_cpyoff + "\n");  // DEBUG ONLY
    }

    this.dec_enclen = this.getInteger();  // DEC_ENCLEN
    printf("DEC_ENCLEN: dec_enclen = " + this.dec_enclen + "\n")  // DEBUG ONLY

    // Calculate the position if the delta was actually read.
    // var positionAfterDelta = this.position + this.dec_enclen;

    // Get the target window length.
    this.dec_tgtlen = this.getInteger();  // DEC_TGTLEN
    printf("DEC_TGTLEN: dec_tgtlen = " + this.dec_tgtlen + "\n");  // DEBUG ONLY

    this.dec_del_ind = this.getByte();  // DEC_DELIND
    printf("DEC_DELIND: dec_del_ind = " + this.dec_del_ind + "\n");  // DEBUG ONLY

    this.data_sect.size = this.getInteger();  // DEC_DATALEN
    this.inst_sect.size = this.getInteger();  // DEC_INSTLEN
    this.addr_sect.size = this.getInteger();  // DEC_ADDRLEN
    printf("DEC_DATALEN: data_sect size = " + this.data_sect.size + "\n");  // DEBUG ONLY
    printf("DEC_INSTLEN: inst_sect size = " + this.inst_sect.size + "\n");  // DEBUG ONLY
    printf("DEC_ADDRLEN: addr_sect size = " + this.addr_sect.size + "\n");  // DEBUG ONLY

    printf("DEC_CKSUM: get checksum if VCD_ADLER32 pos = " + this.position + "\n");  // DEBUG ONLY
    if (this.dec_win_ind & VCD_ADLER32) {  // DEC_CKSUM
      this.dec_cksum = this.xd3_decode_allocate(4);
      dumpBytes(this.dec_cksum, 0, 4);  // DEBUG ONLY
      for (var i = 0; i < 4; i += 1) {
        this.dec_adler32 = (this.dec_adler32 << 8) | this.dec_cksum[i];
      }
      printf("stream->dec_adler32 = "+this.dec_adler32+"\n");  // DEBUG ONLY
    }

    this.xd3_decode_sections();
    dumpBytes(this.data_sect.bytes, 0, this.data_sect.size);  // DEBUG ONLY
    dumpBytes(this.inst_sect.bytes, 0, this.inst_sect.size);  // DEBUG ONLY
    dumpBytes(this.addr_sect.bytes, 0, this.addr_sect.size);  // DEBUG ONLY

    printf('DEC_EMIT:\n');  // DEBUG ONLY
    /* In the C++ code:
     *     To speed VCD_SOURCE block-address calculations, the source
     *     cpyoff_blocks and cpyoff_blkoff are pre-computed.
     * However, in this Javascript code there is no 'blocks'.
     */
    if (this.dec_win_ind & VCD_SOURCE) {
      printf("stream->dec_cpyoff = " + this.dec_cpyoff + "\n");  // DEBUG ONLY
      this.src.cpyoff_blkoff = this.dec_cpyoff;
      printf("src->cpyoff_blkoff = " + this.src.cpyoff_blkoff + "\n");  // DEBUG ONLY
    }
    this.xd3_decode_emit();

    return this.dec_tgtlen;
  };

  /**
   * This function only has code if the preprocessor statement
   * "#if SECONDARY_ANY" is set. SECONDARY_ANY does not seem to be set.
   */
  _XDelta3Decoder.prototype.xd3_decode_secondary_sections = function() {  //
  };

  /**
   * @param {!xd3_desect} sect
   */
  _XDelta3Decoder.prototype.xd3_decode_section = function(sect) {
    // It is possible to just point into the buffer but perhaps that can be done
    // later.
    sect.bytes = this.xd3_decode_allocate(sect.size);
  };

  _XDelta3Decoder.prototype.xd3_decode_sections = function() {
    printf("xd3_decode_sections\n");  // DEBUG ONLY
    this.xd3_decode_section(this.data_sect);
    this.xd3_decode_section(this.inst_sect);
    this.xd3_decode_section(this.addr_sect);

    this.xd3_decode_secondary_sections();

    this.xd3_decode_setup_buffers();
  };

  _XDelta3Decoder.prototype.xd3_decode_setup_buffers = function() {
    printf("xd3_decode_setup_buffers\n");  // DEBUG ONLY
    this.dec_buffer = new DataObject(new Uint8Array(this.dec_tgtlen));
  };

  var VCD_SELF = 0;
  var VCD_HERE = 1;

  /**
   * xd3_decode_address
   * @param {number} here
   * @param {number} mode
   * @param {!xd3_desect} sect
   */
  _XDelta3Decoder.prototype.xd3_decode_address = function(here, mode, sect) {
    printf("xd3_decode_address\n");  // DEBUG ONLY
    var val;
    var same_start = 2 + this.acache.s_near;
    printf("here = " + here + "\n");  // DEBUG ONLY
    printf("mode = " + mode + "\n");  // DEBUG ONLY
    printf("acache.s_near = " + this.acache.s_near + "\n");  // DEBUG ONLY
    printf("same_start = " + same_start + "\n");  // DEBUG ONLY

    if (mode < same_start) {
      val = sect.getInteger();
      printf("val = " + val + "\n");  // DEBUG ONLY
      switch (mode) {
        case VCD_SELF:
          printf('use self\n');  // DEBUG ONLY
          break;
        case VCD_HERE:
          printf('subtract from here\n');  // DEBUG ONLY
          // var old_val = val;
          val = here - val;
          printf("val = " + val + "\n");  // DEBUG ONLY
          break;
        default:
          printf('add near_array['+(mode-2)+'] = '+  // DEBUG ONLY
              this.acache.near_array[mode - 2]+'\n');  // DEBUG ONLY
          val += this.acache.near_array[mode - 2];
          printf("val = " + val + "\n");  // DEBUG ONLY
      }
    } else {
      mode -= same_start;
      var offset = sect.getByte();
      printf("mode = "+mode+", offset = "+offset+"\n");  // DEBUG ONLY
      val = this.acache.same_array[mode * 256 + offset];
      printf("val = " + val + "\n");  // DEBUG ONLY
    }

    this.xd3_update_cache(this.acache, val);

    return val;
  };

  /**
   * @param {!xd3_addr_cache} acache
   * @param {number} addr
   */
  _XDelta3Decoder.prototype.xd3_update_cache = function(acache, addr) {
    printf("acache->s_near = "+acache.s_near+"\n");  // DEBUG ONLY
    if (acache.s_near > 0) {
      acache.near_array[acache.next_slot] = addr;
      printf("acache->near_array["+acache.next_slot+"] = "+addr+"\n");  // DEBUG ONLY
      acache.next_slot = (acache.next_slot + 1) % acache.s_near;
      printf("acache->next_slot = "+acache.next_slot+"\n");  // DEBUG ONLY
    }

    printf("acache->s_same = "+acache.s_same+"\n");  // DEBUG ONLY
    if (acache.s_same > 0) {
      acache.same_array[addr % (acache.s_same * 256)] = addr;
      printf("acache->same_array["+(addr % (acache.s_same*256))+"] = "+addr+"\n");  // DEBUG ONLY
    }
  };

  /**
   * @param {!xd3_hinst} inst
   */
  _XDelta3Decoder.prototype.xd3_decode_output_halfinst = function(inst) {
    printf("xd3_decode_output_halfinst: type=" + inst.type +  // DEBUG ONLY
        ", addr=" + inst.addr + ", size=" + inst.size + "\n");  // DEBUG ONLY
    var take = inst.size;
    var blkoff;
    var start_pos = this.dec_buffer.pos;  // DEBUG ONLY
    printf("start_pos = " + start_pos + "\n");  // DEBUG ONLY

    switch (inst.type) {
      case XD3_RUN:
        var val = this.data_sect.getByte();
        printf("    >>>> XD3_RUN: memset "+ toHexStr(val) +" for " + take + "\n");  // DEBUG ONLY
        this.dec_buffer.fill(val, take);
        dumpBytes(this.dec_buffer.bytes, start_pos, take);  // DEBUG ONLY
        break;

      case XD3_ADD:
        printf("    >>>> XD3_ADD: memcpy "+take+" from the data_sect\n");  // DEBUG ONLY
        this.dec_buffer.copySect(this.data_sect, take);
        dumpBytes(this.dec_buffer.bytes, start_pos, take);  // DEBUG ONLY
        break;

      default:
        printf("    >>>> XD3_CPY\n");  // DEBUG ONLY
        printf("dec_cpylen = " + this.dec_cpylen + "\n");  // DEBUG ONLY
        var overlap;
        var overlap_pos;
        if (inst.addr < this.dec_cpylen) {
          overlap = 0;
          printf("overlap = 0\n");  // DEBUG ONLY
          if (this.dec_win_ind & VCD_TARGET) {
            throw new Error('VCD_TARGET not supported');
          } else {
            printf("read source block\n");  // DEBUG ONLY
            blkoff = this.src.cpyoff_blkoff;
            printf("blkoff = " + blkoff + "\n");  // DEBUG ONLY
            printf("add inst addr to blkoff\n");  // DEBUG ONLY
            blkoff = this.dec_cpyoff + inst.addr;
            printf("blkoff = " + blkoff + "\n");  // DEBUG ONLY
          }
        } else {
          overlap = 1;
          printf("overlap = 1\n");  // DEBUG ONLY
          overlap_pos = inst.addr - this.dec_cpylen;
          printf("overlap_pos = "+overlap_pos+"\n");  // DEBUG ONLY
        }
        if (overlap) {
          printf("   <<<< manually copy "+take+"\n");  // DEBUG ONLY
          this.dec_buffer.copyBytes(this.dec_buffer.bytes, overlap_pos, take);
          dumpBytes(this.dec_buffer.bytes, start_pos, take);  // DEBUG ONLY
        } else {
          printf("   <<<< memcopy take=" + take + "\n");  // DEBUG ONLY
          this.dec_buffer.copyBytes(this.source.bytes, blkoff, take);
          dumpBytes(this.dec_buffer.bytes, start_pos, take);  // DEBUG ONLY
        }
    }
  };

  /**
   * xref: xd3_decode_parse_halfinst
   * @param {!xd3_hinst} inst
   */
  _XDelta3Decoder.prototype.xd3_decode_parse_halfinst = function(inst) {
    printf("xd3_decode_parse_halfinst\n");  // DEBUG ONLY
    // Get size and address if necessary.
    if (inst.size == 0) {
      inst.size = this.inst_sect.getInteger();
      printf("read inst size = " + inst.size + "\n");  // DEBUG ONLY
    }

    /* For copy instructions, read address. */
    if (inst.type >= XD3_CPY) {
      printf("dec_position = " + this.dec_position + "\n");  // DEBUG ONLY
      var mode = inst.type - XD3_CPY;
      printf("mode = " + mode + "\n");  // DEBUG ONLY
      inst.addr =
          this.xd3_decode_address(this.dec_position, mode, this.addr_sect);
      printf("XD3_CPY address  = " + inst.addr + "\n");  // DEBUG ONLY
    }

    printf('dec_position = ' + this.dec_position + "\n");  // DEBUG ONLY
    printf('inst size = ' + inst.size + "\n");  // DEBUG ONLY
    this.dec_position += inst.size;
    printf('dec_position = ' + this.dec_position + "\n");  // DEBUG ONLY
  };

  var instCount = 0;  // DEBUG ONLY
  /**
   * xref: xd3_decode_instruction
   */
  _XDelta3Decoder.prototype.xd3_decode_instruction = function() {
    printf("xd3_decode_instruction "+(instCount++)+"\n");  // DEBUG ONLY
    var code_table = this.code_table;
    var instPair = this.inst_sect.getByte();
    printf('instPair = ' + instPair + "\n");  // DEBUG ONLY

    this.dec_current1.type = code_table.tableRows[instPair].type1;
    this.dec_current1.size = code_table.tableRows[instPair].size1;
    // dec_current1.addr keeps it previous value.

    this.dec_current2.type = code_table.tableRows[instPair].type2;
    this.dec_current2.size = code_table.tableRows[instPair].size2;
    // dec_current2.addr keeps it previous value.

    printInstructionPair(this.dec_current1, this.dec_current2);  // DEBUG ONLY

    /* For each instruction with a real operation, decode the
     * corresponding size and addresses if necessary.  Assume a
     * code-table may have NOOP in either position, although this is
     * unlikely. */
    if (this.dec_current1.type != XD3_NOOP) {
      this.xd3_decode_parse_halfinst(this.dec_current1);
    }
    if (this.dec_current2.type != XD3_NOOP) {
      this.xd3_decode_parse_halfinst(this.dec_current2);
    }
  };

  _XDelta3Decoder.prototype.xd3_decode_finish_window = function() {
    printf("xd3_decode_finish_window\n");  // DEBUG ONLY
    // stream->dec_winbytes  = 0;
    // stream->dec_state     = DEC_FINISH;
    this.data_sect.pos = 0;
    this.inst_sect.pos = 0;
    this.addr_sect.pos = 0;
  };

  _XDelta3Decoder.prototype.xd3_decode_emit = function() {
    printf("\n\n");  // DEBUG ONLY
    printf("#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@\n");  // DEBUG ONLY
    printf("    xd3_decode_emit:\n");  // DEBUG ONLY
    printf("#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@\n");  // DEBUG ONLY

    var instLength = this.inst_sect.bytes.byteLength;
    /* Decode next instruction pair. */
    while (this.inst_sect.pos < instLength) {
      printf('\n========== Decode next instruction pair ==========\n');  // DEBUG ONLY
      this.xd3_decode_instruction();

      /* Output dec_current1 */
      if (this.dec_current1.type != XD3_NOOP) {
        printf("output dec_current1 ----------\n");  // DEBUG ONLY
        this.xd3_decode_output_halfinst(this.dec_current1);
      }
      /* Output dec_current2 */
      if (this.dec_current2.type != XD3_NOOP) {
        printf("output dec_current2 ----------\n");  // DEBUG ONLY
        this.xd3_decode_output_halfinst(this.dec_current2);
      }
    }
    printf("check checksum is VCD_ADLER32 set\n");  // DEBUG ONLY
    if (this.dec_win_ind & VCD_ADLER32) {
      var a32 = adler32(1, this.dec_buffer.bytes, 0, this.dec_tgtlen);
      printf("a32 = "+a32+"\n");  // DEBUG ONLY
      if (a32 != this.dec_adler32) {
        throw new Error('target window checksum mismatch');
      }
    }

    /* Finished with a window. */
    this.xd3_decode_finish_window();
  };

  _XDelta3Decoder.prototype.xd3_alloc = function(length) {
    return new Uint8Array(length);
  };

  _XDelta3Decoder.prototype.xd3_decode_bytes = function(bytes, pos, length) {
    for (var i = 0; i < length; i++) {
      bytes[pos + i] = this.delta[this.position++];
    }
  };

  _XDelta3Decoder.prototype.xd3_decode_allocate = function(length) {
    var bytes =
        new Uint8Array(this.delta.slice(this.position, this.position + length));
    this.position += length;
    return bytes;
  };

  _XDelta3Decoder.prototype.getByte = function() {
    return this.delta[this.position++];
  };

  _XDelta3Decoder.prototype.getInteger = function() {
    var maxBytes = Math.min(20, this.delta.length - this.position);
    var integer = 0;
    for (var i = 0; i < maxBytes; i++) {
      var aPart = this.delta[this.position++];
      integer += aPart & 0x7F;
      if (!(aPart & 0x80)) {
        return integer;
      }
      integer <<= 7;
    }
    throw new Error('delta integer too long');
  };

  /**
   * The code table.
   * @param {!Array<xd3_dinst>} tableRows
   * @constructor
   * @struct
   */
  var xd3_dinst_table = function(tableRows) {
    /** @type {!Array<xd3_dinst>} */
    this.tableRows = tableRows;
  };

  /**
   * xd3_hinst
   * @constructor
   */
  function xd3_hinst() {
    this.type = XD3_NOOP;
    this.size = 0;
    this.addr = 0;
  }

  /**
   * The code-table double instruction.
   * @constructor
   */
  function xd3_dinst() {
    /** @type {number} */
    this.type1 = XD3_NOOP;
    /** @type {number} */
    this.size1 = 0;
    /** @type {number} */
    this.type2 = XD3_NOOP;
    /** @type {number} */
    this.size2 = 0;
  }

  /**
   * @param {!xd3_code_table_desc} desc
   * @return {!xd3_dinst_table}
   */
  function xd3_build_code_table(desc) {
    printf("xd3_build_code_table\n");  // DEBUG ONLY
    var startRow = 0;  // DEBUG ONLY
    var row = 0;
    var tableRows = new Array(256);
    for (var i = 0; i < 256; i++) {
      tableRows[i] = new xd3_dinst();
    }
    var cpyModes = 2 + desc.near_modes + desc.same_modes;

    // The single RUN command.
    tableRows[row++].type1 = XD3_RUN;

    // The ADD only commands.
    tableRows[row++].type1 = XD3_ADD;
    for (var size1 = 1; size1 <= desc.add_sizes; size1++) {
      tableRows[row].type1 = XD3_ADD;
      tableRows[row++].size1 = size1;
    }
    dumpCodeTableRows(tableRows, startRow, row);  // DEBUG ONLY
    startRow = row;  // DEBUG ONLY

    // The Copy only commands.
    for (var mode = 0; mode < cpyModes; mode++) {
      tableRows[row++].type1 = XD3_CPY + mode;

      for (var size1 = MIN_MATCH; size1 < MIN_MATCH + desc.cpy_sizes; size1++) {
        tableRows[row].type1 = XD3_CPY + mode;
        tableRows[row++].size1 = size1;
      }
      dumpCodeTableRows(tableRows, startRow, row);  // DEBUG ONLY
      startRow = row;  // DEBUG ONLY
    }

    // The Add/Copy commands.
    for (var mode = 0; mode < cpyModes; mode++) {
      for (var size1 = 1; size1 <= desc.addcopy_add_max; size1++) {
        var max = (mode < 2 + desc.near_modes) ?  //
            desc.addcopy_near_cpy_max :
            desc.addcopy_same_cpy_max;
        for (var size2 = MIN_MATCH; size2 <= max; size2++) {
          tableRows[row].type1 = XD3_ADD;
          tableRows[row].size1 = size1;
          tableRows[row].type2 = XD3_CPY + mode;
          tableRows[row++].size2 = size2;
        }
      }
      dumpCodeTableRows(tableRows, startRow, row);  // DEBUG ONLY
      startRow = row;  // DEBUG ONLY
    }

    // The Copy/Add commands.
    for (var mode = 0; mode < cpyModes; mode++) {
      var max = (mode < 2 + desc.near_modes) ?  //
          desc.copyadd_near_cpy_max :
          desc.copyadd_same_cpy_max;
      for (var size1 = MIN_MATCH; size1 <= max; size1++) {
        for (var size2 = 1; size2 <= desc.copyadd_add_max; size2++) {
          tableRows[row].type1 = XD3_CPY + mode;
          tableRows[row].size1 = size1;
          tableRows[row].type2 = XD3_ADD;
          tableRows[row++].size2 = size2;
        }
      }
    }
    dumpCodeTableRows(tableRows, startRow, row);  // DEBUG ONLY

    return new xd3_dinst_table(tableRows);
  }


  /**
   * @constructor
   */
  function xd3_code_table_desc() {
    this.add_sizes = 0;
    this.near_modes = 0;
    this.same_modes = 0;
    this.cpy_sizes = 0;

    this.addcopy_add_max = 0;
    this.addcopy_near_cpy_max = 0;
    this.addcopy_same_cpy_max = 0;

    this.copyadd_add_max = 0;
    this.copyadd_near_cpy_max = 0;
    this.copyadd_same_cpy_max = 0;
  }


  /**
   * This builds the __rfc3284_code_table_desc
   * Assumes a single RUN instruction
   * Assumes that MIN_MATCH is 4.
   * @return {!xd3_code_table_desc}
   */
  function build_rfc3284_code_table_desc() {
    var desc = new xd3_code_table_desc();
    desc.add_sizes = 17;
    desc.near_modes = 4;
    desc.same_modes = 3;
    desc.cpy_sizes = 15;

    desc.addcopy_add_max = 4;
    desc.addcopy_near_cpy_max = 6;
    desc.addcopy_same_cpy_max = 4;

    desc.copyadd_add_max = 1;
    desc.copyadd_near_cpy_max = 4;
    desc.copyadd_same_cpy_max = 4;

    // xd3_code_table_sizes addcopy_max_sizes[MAX_MODES];
    // { {6,163,3},{6,175,3},{6,187,3},{6,199,3},{6,211,3},{6,223,3},
    // {4,235,1},{4,239,1},{4,243,1} },

    // xd3_code_table_sizes copyadd_max_sizes[MAX_MODES];
    // { {4,247,1},{4,248,1},{4,249,1},{4,250,1},{4,251,1},{4,252,1},
    // {4,253,1},{4,254,1},{4,255,1} },

    return desc;
  }

  var __rfc3284_code_table_desc = build_rfc3284_code_table_desc();

  var A32_BASE = 65521; /* Largest prime smaller than 2^16 */
  var A32_NMAX = 5552;  /* NMAX is the largest n such that 255n(n+1)/2
                            + (n+1)(BASE-1) <= 2^32-1 */

  // 1140 #define A32_DO1(buf,i)  {s1 += buf[i]; s2 += s1;}
  // 1141 #define A32_DO2(buf,i)  A32_DO1(buf,i); A32_DO1(buf,i+1);
  // 1142 #define A32_DO4(buf,i)  A32_DO2(buf,i); A32_DO2(buf,i+2);
  // 1143 #define A32_DO8(buf,i)  A32_DO4(buf,i); A32_DO4(buf,i+4);
  // 1144 #define A32_DO16(buf)   A32_DO8(buf,0); A32_DO8(buf,8);


  /**
   * Calculated the Adler32 checksum.
   * @param {number} adler I'm not sure what this is.
   * @param {!Uint8Array} buf
   * @param {number} pos
   * @param {number} len
   * @return {number}
   */
  function adler32(adler, buf, pos, len) {
    printf("adler32: adler = "+adler+"\n");  // DEBUG ONLY
    printf("adler32: len = "+len+"\n");  // DEBUG ONLY
    var s1 = adler & 0xffff;
    var s2 = (adler >> 16) & 0xffff;
    var k;

    while (len > 0) {
      k = (len < A32_NMAX) ? len : A32_NMAX;
      len -= k;

      if (k != 0) {
        do {
          s1 += buf[pos++];
          s2 += s1;
        } while (--k);
      }

      s1 %= A32_BASE;
      s2 %= A32_BASE;
    }

    return (s2 << 16) | s1;
  }


  /**
   * @constructor
   */
  function xd3_addr_cache(s_near, s_same) {
    this.s_near = s_near;
    this.s_same = s_same;
    this.next_slot = 0; /* the circular index for near */
    this.near_array = null;    /* array of size s_near        */
    this.same_array = null;    /* array of size s_same*256    */
  }


  /**
   * @param {!xd3_addr_cache} acache
   */
  function xd3_init_cache(acache) {
    printf("xd3_init_cache\n");  // DEBUG ONLY
    if (acache.s_near > 0) {
      for (var i = 0; i < acache.near_array.length; i++) {
        acache.near_array[i] = 0;
      }
      acache.next_slot = 0;
    }

    if (acache.s_same > 0) {
      for (var i = 0; i < acache.same_array.length; i++) {
        acache.same_array[i] = 0;
      }
    }
  }

  /**
   * Used by the decoder to buffer input in sections.
   * XDelta3 C++ struct.
   * @constructor
   * @struct
   */
  function xd3_desect() {
    /**
     * The buffer as a slice of the backingBuffer;
     * @type {?Uint8Array}
     */
    this.bytes = null;

    /** @type {number} */
    this.size = 0;

    /** @type {number} */
    this.pos = 0;
  }

  /**
   * Gets a byte from the section.
   * @return {number}
   */
  xd3_desect.prototype.getByte = function() {
    if (!this.bytes) {
      throw new Error('bytes not set');
    }
    return this.bytes[this.pos++];
  };

  /**
   * Gets an integer from the section.
   * XDelta3 integers are encodes as a variable number of 7 bit bytes. Bit 8, the
   * most significant bit is used to indicate more bytes needed.
   * @return {number}
   */
  xd3_desect.prototype.getInteger = function() {
    if (!this.bytes) {
      throw new Error('bytes not set');
    }
    var val = 0;
    for (var i = 0; i < 10; i++) {
      var aByte = this.bytes[this.pos++];
      val += aByte & 0x7F;
      if (!(aByte & 0x80)) {
        return val;
      }
      val <<= 7;
    }
    throw new Error('invalid number');
  };


  /**
   * Builds a default code table.
   * @return {!xd3_dinst_table}
   */
  function xd3_rfc3284_code_table() {
    printf("xd3_rfc3284_code_table\n");  // DEBUG ONLY
    return xd3_build_code_table(__rfc3284_code_table_desc);
  }

  /**
   * Allocates and initializes a Javascript Array.
   * @return {!Array<number>}
   */
  function allocArray(len, val) {
    var arr = new Array(len);
    for (var i = 0; i < len; i++) {
      arr[i] = val;
    }
    return arr;
  }

  /**
   * @constructor
   */
  function xd3_source() {
    /** @type {number} */
    this.cpyoff_blkoff = -1;
  }

  /**
   * @param {!Uint8Array} bytes
   * @constructor
   */
  function DataObject(bytes) {
    this.pos = 0;
    this.bytes = bytes;
  };

  DataObject.prototype.getByte = function() {
    return this.bytes[this.pos++];
  };

  DataObject.prototype.getInteger = function() {
    var val = 0;
    for (var i = 0; i < 10; i++) {
      var aByte = this.bytes[this.pos++];
      val += aByte & 0x7F;
      if (!(aByte & 0x80)) {
        return val;
      }
      val <<= 7;
    }
    throw new Error('invalid number');
  };

  DataObject.prototype.fill = function(val, length) {
    // TODO(bstell): see if there is a function for this.
    for (var i = 0; i < length; i++) {
      this.bytes[this.pos++] = val;
    }
  };

  /**
   * @param {!xd3_desect} sect
   * @param {number} length
   */
  DataObject.prototype.copySect = function(sect, length) {
    // TODO(bstell): see if there is a function for this.
    for (var i = 0; i < length; i++) {
      this.bytes[this.pos++] = sect.bytes[sect.pos++];
    }
  };

  DataObject.prototype.copyBytes = function(bytes, offset, length) {
    // TODO(bstell): see if there is a function for this.
    for (var i = 0; i < length; i++) {
      this.bytes[this.pos++] = bytes[offset++];
    }
  };

})();
