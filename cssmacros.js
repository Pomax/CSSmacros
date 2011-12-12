/**
* This JavaScript "library" lets you use macros
* in CSS files, so that designers don't have to
* rely on classes or secondary locations to group
* elements that share (visual) design properties.
*
* (c) Mike"Pomax" Kamermans, 2011
*/

// these are here mainly to appease JSLint, which
// doesn't know about the W3C CSS DOM API

/*
if (!CSSStyleSheet) { CSSStyleSheet = {}; }
if (!StyleSheetList) { StyleSheetList = {}; }
if (!jQuery) { jQuery = {}; }
*/

(function () {
  // if this date-time is after whatever version you're
  // using, it's newer, and you'll want to update =)
  var VERSION = "2011-12-12.15.55";

  // good to have lying around
  var undef;
  var noop = function () {};

/*
  // comment off the second to disable logging
  var log = noop;
  log = function(string) { window.console.log(string); }
*/

  /**
   * Helper function - strip comments from a string.
   */
  var stripComments = function (data) {
    var i, e, chr,
      inquote1 = false,
      inquote2 = false,
      incomment = false,
      rewritten = "";
    for (i = 0, e = data.length; i < e; i++) {
      chr = data[i];
      if (!incomment) {
        if (!inquote1 && !inquote2 && chr === "'") {
          inquote1 = true;
        } else if (!inquote1 && !inquote2 && chr === '"') {
          inquote2 = true;
        } else if (inquote1 && chr === "'") {
          inquote1 = false;
        } else if (inquote2 && chr === '"') {
          inquote2 = false;
        }
      }

      if (!inquote1 && !inquote2 && !incomment && chr === "/" && i + 1 < e && data[i + 1] === "*") {
        incomment = true;
      } else if (!inquote1 && !inquote2 && incomment && chr === "*" && i + 1 < e && data[i + 1] === "/") {
        incomment = false;
        i += 1; // we need to skip the "/" in the "*/" pair
        continue;
      }

      if (!incomment) {
        rewritten += chr;
      }
    }
    return rewritten;
  };

  // administrative cache, for deferred CSSStyleSheet property setting
  var bindings = [];

  /**
   * Clear a sheet, and inject the rules based on
   * whatever the macros indicate should be the
   * replacement text.
   */
  var setRulesForSheet = function (child, rules) {
    // record the sheet size prior to new rule insertion
    if(child.cssRules) {
      var cssRules = child.cssRules,
          offset = 0;

      // replace any rules that require modification
      var r, e, ruleCount = cssRules.length, rule, result;
      for (r = rules.length-1; r>=0; r--) {
        rule = rules[r];
        if (rule.trim() === "") { continue; }
        rule = rule.replace(/\n/g, '').replace(/\n/g, '');
        if(child.deleteRule) { child.deleteRule(r); }
        else { child.removeRule(r); }
        child.insertRule(rule, r);
      }
    }
  };

  /**
   * Update a macros object with additional or override entries.
   */
  var mergeMacros = function (macros, updates) {
    var a, newmacros={};
    // copy all global macros
    for (macro in macros ) {
      newmacros[macro] = macros[macro];
    }
    // copy all local macros
    for (macro in updates) {
      newmacros[macro] = updates[macro];
    }
    // return total to-replace macro list
    return newmacros;
  };

  /**
   * Replace all macro instances with the
   * corresponding replacement value in a string.
   */
  var replaceMacro = function (text, macro, value) {
    var re = ":([\\w\\s]*)" + macro + "([\\w\\s]*);";
    return text.replace(new RegExp(re, "gi"), ":$1" + value + "$2;");
  };

  /**
   * Replace all macros in CSS (macros only apply to ": value")
   */
  var cssReplace = function (cssstring, macros) {
    if(cssstring.trim()==="") return "";
    var macro;
    for (macro in macros) {
      cssstring = replaceMacro(cssstring, macro, macros[macro]);
    }
    return cssstring;
  };

  /**
   * Extract global macro rules.
   */
  var processGlobalMacros = function (data) {
    var newdata, declarations, i, e, macro, macros = {}, value, legalcss, line;
    // step one: get the macro block
    newdata = data.replace(/\r/g, "");
    newdata = newdata.replace(/\n/g, "");
    newdata = newdata.substring(newdata.indexOf("@global-macros")+14);
    newdata = newdata.replace(/\}.*/, "").substring(newdata.indexOf("{") + 1);
    newdata = stripComments(newdata);
    declarations = newdata.split(";");
    // FIXME: this will simply remove the first block
    legalcss = stripComments(data.substring(data.indexOf("}") + 1));
    // step two: get the individual macros
    for (i = 0, e = declarations.length; i < e; i++) {
      line = declarations[i];
      if (line.indexOf(":") < 0) { continue; }
      line = line.split(":");
      macro = line[0].trim();
      value = line[1].trim();
      document.styleSheets.globalCSSmacros[macro] = value;
    }
    return legalcss;
  }

  /**
   * If {data} contains a macro definition (@macro { ... }),
   * extract the macros, and then apply them to the data body.
   */
  var replaceMacrosInCSSText = function (data) {
    var newdata="", declarations, i, e, macro, macros = {}, value, legalcss=data, line, cssrules=false;

    if(data.indexOf("@macros")>=0) {
      // step one: get the macro block
      newdata = data.replace(/\r/g, "");
      newdata = newdata.replace(/\n/g, "");
      newdata = newdata.substring(newdata.indexOf("@macros")+7);
      newdata = newdata.replace(/\}.*/, "").substring(newdata.indexOf("{") + 1);
      newdata = stripComments(newdata);
      declarations = newdata.split(";");
      // step two: get everything after macro block, stripped of comments
      // FIXME: this will simply remove the first block
      legalcss = stripComments(data.substring(data.indexOf("}") + 1));
      // step three: get the individual macros
      for (i = 0, e = declarations.length; i < e; i++) {
        line = declarations[i];
        if (line.indexOf(":") < 0) { continue; }
        line = line.split(":");
        macro = line[0].trim();
        value = line[1].trim();
        macros[macro] = value;
      }
      // step four: perform macro replacement
      newdata = cssReplace(legalcss, macros);
      // step five: split real CSS text into individual rules and return
      newdata = newdata.replace(new RegExp("}", "g"), "}¤");
      cssrules = newdata.split("¤");
    }

    return {rules: cssrules, csstext: legalcss, macros: macros};
  };

  /**
   * Set up macro-replaced CSS rules for this
   * stylesheet (provided it needs replacements)
   */
  var replaceCSSMacros = function (sheet, css_text) {
    // are there any macros to work with? if not, don't do anything
    var lc = css_text.toLowerCase()
        hasMacros = lc.indexOf("@macros") >= 0;
        hasGlobals = lc.indexOf("@global-macros") >= 0,
        macros = {};

    // are there any global macros declarations?
    if (hasGlobals) {
      css_text = processGlobalMacros(css_text);
    }

    // start with whatever the global macros are at this point
    macros = document.styleSheets.globalCSSmacros;

    // then perform macro replacement, which will grow the macros
    // list if local macros are declared as well.
    var replacement = replaceMacrosInCSSText(css_text),
      rules = replacement.rules,
      csstext = replacement.csstext,
      macros = mergeMacros(macros, replacement.macros);

    if (rules !== false) {
      // this replaces the current (possibly broken due to macros)
      // rules with macro-replaced (valid) rules.
      setRulesForSheet(sheet, rules);
    }
    return {csstext: csstext, macros: macros};
  };

  /**
   * Process a stylesheet for macro replacement.
   * If we're processing a sytlesheet that has
   * already been treated, use the cached raw
   * text instead.
   */
  var processStyleSheet = function (sheet) {
    // did we already process this sheet earlier?
    if (sheet.macros && sheet.rawCSSText) {
      var replaced = cssReplace(sheet.rawCSSText, sheet.macros);
      replaced = replaced.replace(new RegExp("}", "g"), "}¤");
      var rules = replaced.split("¤");
      setRulesForSheet(sheet, rules);
      return false;
    }

    // we did not. Perform full replacement
    var macros = {},
      csstext = "";

    // from file
    if(sheet.href && sheet.href !== "") {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', sheet.href, false);
      xhr.send(null);
      if (xhr.status === 200) {
        var result = replaceCSSMacros(sheet, xhr.responseText);
        csstext = result.csstext;
        macros = result.macros;
      }
    }
    // inline style
    else {
      // TODO: implement
      return false;
    }
    return {macros: macros, csstext: csstext};
  };

  /**
   * Bind data so that it's still there after we finish
   */
  var bindData = function () {
    var i, e=bindings.length, binding, sheet, macros, macro, csstext;
    for (i = 0; i < e; i++) {
      binding = bindings[i];
      if (binding.sheet && binding.csstext && binding.macros) {
        sheet = binding.sheet;
        csstext = binding.csstext;
        sheet.setCSSText(csstext);
        macros = binding.macros;
        sheet.setMacros(macros);
        processStyleSheet(sheet);
      }
    }
  };

  /**
   * This is the script's entry point. It runs through
   * all stylesheets to see if they contain a @macros block,
   * and then performs macro replacement for each.
   */
  var processStylesheetMacros = function () {
    var sheet,
      styles = document.styleSheets,
      i,
      e,
      macros,
      csstext,
      result;

    // add a global CSS macros container to the stylesheet list
    if(!StyleSheetList.prototype.globalCSSmacros) {
      StyleSheetList.prototype.globalCSSmacros = {};
    }

    // loop through all stylesheets to see if they need replacing
    for (i = 0, e = styles.length; i < e; i++) {
      macros = {};
      csstext = "";
      sheet = styles[i];
      if (sheet instanceof CSSStyleSheet) {
        result = processStyleSheet(sheet);
        if (!result) {
          continue;
        }
        macros = result.macros;
        csstext = result.csstext;
        bindings.push({sheet: sheet, macros: macros, csstext: csstext});
      }
    }
    // after aggregating all data, bind it.
    bindData();
  };

  // ===========================
  // CSSStyleSheet modifications
  // ===========================

  // cached raw CSS text property
  if (CSSStyleSheet.prototype.rawCSStext === undef) {
    CSSStyleSheet.prototype.rawCSStext = "";
  }

  // cache macros that are to be applied to the raw CSS text
  if (CSSStyleSheet.prototype.macros === undef) {
    CSSStyleSheet.prototype.macros = [];
  }

  // Add if not defined: cache raw CSS text
  if (CSSStyleSheet.prototype.setCSSText === undef) {
    CSSStyleSheet.prototype.setCSSText = function (css_text) {
      this.rawCSSText = css_text;
    };
  }

  // Add if not defined: cache CSS macros
  if (CSSStyleSheet.prototype.setMacros === undef) {
    CSSStyleSheet.prototype.setMacros = function (macros) {
      this.macros = macros;
    };
  }

  // Add if not defined: modify a macro value
  if (CSSStyleSheet.prototype.setMacro === undef) {
    CSSStyleSheet.prototype.setMacro = function (macro, value) {
      this.macros[macro] = value;
      processStyleSheet(this);
    };
  }

  // Add if not defined: get a macro value
  if (CSSStyleSheet.prototype.getMacro === undef) {
    CSSStyleSheet.prototype.getMacro = function (macro) {
      return this.macros[macro];
    };
  }

  // ============================
  // StyleSheetList modifications
  // ============================

  // Add if not defined: set a macro value for a named sheet
  if (StyleSheetList.prototype.setMacro === undef) {
    StyleSheetList.prototype.setMacro = function (sheetname, macro, value) {
      var i, e, sheet;
      for (i = 0, e = this.length; i < e; i++) {
        sheet = this[i];
        if (sheet instanceof CSSStyleSheet && sheet.href.replace(/.*\//, '') === sheetname) {
          sheet.setMacro(macro, value);
          break;
        }
      }
    };
  }

  // Add if not defined: set a macro value for all sheets
  if (StyleSheetList.prototype.setMacroForAll === undef) {
    StyleSheetList.prototype.setMacroForAll = function (macro, value) {
      var i, e, sheet;
      for (i = 0, e = this.length; i < e; i++) {
        sheet = this[i];
        if (sheet instanceof CSSStyleSheet) {
          sheet.setMacro(macro, value);
        }
      }
    };
  }

  // Add if not defined: get a macro value for a named sheet
  if (StyleSheetList.prototype.getMacro === undef) {
    StyleSheetList.prototype.getMacro = function (sheetname, macro) {
      var i, e, sheet;
      for (i = 0, e = this.length; i < e; i++) {
        sheet = this[i];
        if (sheet instanceof CSSStyleSheet && sheet.href.replace(/.*\//, '') === sheetname) {
          return sheet.getMacro(macro);
        }
      }
    };
  }

  // ================================
  // Let's extend jQuery if it exists
  // ================================

  if (jQuery) {
    jQuery.fn.macro = function (macro, value) {
      // helper function: get the relevant CSSStyleSheet object
      var getSheet = function (link) {
        if (link.nodeName.toLowerCase() === "link") {
          var href = link.href, i = 0, sheets = document.styleSheets, e = sheets.length, sheet;
          for (i = 0; i < e; i++) {
            sheet = sheets[i];
            if (sheet.href === href) {
              return sheet;
            }
          }
        }
        return false;
      };
      // setter function definition
      var setMacro = function (link, macro, value) {
        if (link.nodeName.toLowerCase() === "link") {
          var sheet = getSheet(link);
          if (sheet) {
            sheet.setMacro(macro, value);
          }
        }
      };
      // getter function definition
      var getMacro = function (macro) {
        if (this.nodeName.toLowerCase() === "link") {
          var sheet = getSheet(this);
          if (sheet) {
            return sheet.getMacro(macro);
          }
        }
        return false;
      };
      // are we being asked for a macro's value? Find the first instance, or null if !exist.
      if (value === undef) {
        var i, e, sheet;
        for (i = 0, e = this.length; i < e; i++) {
          sheet = getSheet(this[i]);
          if(!sheet) continue;
          value = sheet.getMacro(macro);
          if (value) {
            return value;
          }
        }
        return null;
      }
      // no, we're being asked to set it. Set for all, then return a jQuery set.
      return this.each(function () { setMacro(this, macro, value); });
    };
  }

  // =============================
  // execute on dom content loaded
  // =============================
  if (document.addEventListener) {
    document.addEventListener("DOMContentLoaded", processStylesheetMacros, false);
  }

}());