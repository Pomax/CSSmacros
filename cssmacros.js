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
if (!CSSStyleSheet) { CSSStyleSheet = {}; }
if (!StyleSheetList) { StyleSheetList = {}; }

(function () {
  // good to have lying around
  var undef;
  var noop = function () {};

/*
  // comment off the second to disable logging
  var log = noop;
  log = function(string) { window.console.log(string); }
*/

  // administrative cache, for deferred CSSStyleSheet property setting
  var bindings = [];

  /**
   * Clear a sheet, and inject the rules based on
   * whatever the macros indicate should be the
   * replacement text.
   */
  var setRulesForSheet = function (child, rules) {
    // record the sheet size prior to new rule insertion
    var offset = child.length;

    // insert the new rules, at the end of the stylesheet
    var r, e, ruleCount = child.cssRules.length, rule, result;
    for (r = 0, e = rules.length; r < e; r++) {
      rule = rules[r];
      if (rule.trim() === "") { continue; }
      rule = rule.replace(/\n/g, '').replace(/\n/g, '');
      result = child.insertRule(rule, ruleCount + r);
    }

    // Then we clean up by removing the old rules.
    // we could leave them in, because the new rules
    // "overrule" them, but it's better to remove them.
    while (offset-- >= 0) {
      child.removeRule(0);
    }
  };

  /**
   * Replace all macros in CSS (macros only apply to ": value")
   */
  var cssReplace = function (cssstring, macros) {
    var macro;
    for (macro in macros) {
      var value = macros[macro];
      var re = ":([\\w\\s]*)" + macro + "([\\w\\s]*);";
      cssstring = cssstring.replace(new RegExp(re, "gi"), ":$1" + value + "$2;");
    }
    return cssstring;
  };

  /**
   * If {data} contains a macro definition (@macro { ... }),
   * extract the macros, and then apply them to the data body.
   */
  var replaceMacrosInCSSText = function (data) {
    var newdata, declarations, i, e, macro, macros = {}, value, legalcss, line;
    // step one: get the macro block
    newdata = data.replace(/\r/g, "");
    newdata = newdata.replace(/\n/g, "");
    newdata = newdata.replace(/\}.*/, "").substring(newdata.indexOf("{") + 1);
    declarations = newdata.split(";");
    // step two: get everything after macro block
    legalcss = data.substring(data.indexOf("}") + 1);
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
    var cssrules = newdata.split("¤");
    return {rules: cssrules, csstext: legalcss, macros: macros};
  };

  /**
   * Set up macro-replaced CSS rules for this
   * stylesheet (provided it needs replacements)
   */
  var replaceCSSMacros = function (sheet, css_text) {
    // are there any macros to work with? if not, don't do anything
    if (css_text.toLowerCase().indexOf("@macros") < 0) {
      return false;
    }
    // there are. perform macro replacement
    var replacement = replaceMacrosInCSSText(css_text),
      rules = replacement.rules,
      csstext = replacement.csstext,
      macros = replacement.macros;
    if (rules !== false) {
      // this replaces the current (broken due to macros)
      // rules with the rewritten (valid) rules, in situ.
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
    var xhr = new XMLHttpRequest();
    xhr.open('GET', sheet.href, false);
    xhr.send(null);
    if (xhr.status === 200) {
      var result = replaceCSSMacros(sheet, xhr.responseText);
      csstext = result.csstext;
      macros = result.macros;
    }
    return {macros: macros, csstext: csstext};
  };

  /**
   * Bind data so that it's still there after we finish
   */
  var bindData = function () {
    var i, e, binding, sheet, macros, csstext;
    for (i = 0, e = bindings.length; i < e; i++) {
      binding = bindings[i];
      if(binding.sheet && binding.csstext && binding.macros) {
        sheet = binding.sheet;
        csstext = binding.csstext;
        macros = binding.macros;
        sheet.setCSSText(csstext);
        sheet.setMacros(macros);
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
      i, e,
      macros,
      csstext,
      result;

    // loop through all stylesheets to see if they need replacing
    for (i = 0, e = styles.length; i < e; i++) {
      macros = {};
      csstext = "";
      sheet = styles[i];
      if (sheet instanceof CSSStyleSheet) {
        result = processStyleSheet(sheet);
        if(!result) { continue; }
        macros = result.macros;
        csstext = result.csstext;
        bindings.push({sheet: sheet, macros: macros, csstext: csstext});
      }
    }
    // bind values in a separate thread, to escape closure optimisation
    // throwing away data being bound to a CSSStyleSheet object
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

  // Browsers that don't support removeRule require shimming
  if (CSSStyleSheet.prototype.deleteRule && CSSStyleSheet.prototype.removeRule === undef) {
    CSSStyleSheet.prototype.removeRule = CSSStyleSheet.prototype.deleteRule;
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

  // =============================
  // execute on dom content loaded
  // =============================
  if (document.addEventListener) {
    document.addEventListener("DOMContentLoaded", processStylesheetMacros, false);
  }

}());