import {createRequire as __nativeCreateRequire} from 'node:module'; const require=__nativeCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../../tmp/recflare-build/node_modules/isemail/lib/index.js
var require_lib = __commonJS({
  "../../../tmp/recflare-build/node_modules/isemail/lib/index.js"(exports) {
    "use strict";
    var Punycode = __require("punycode");
    var Util = __require("util");
    var internals = {
      hasOwn: Object.prototype.hasOwnProperty,
      indexOf: Array.prototype.indexOf,
      defaultThreshold: 16,
      maxIPv6Groups: 8,
      categories: {
        valid: 1,
        dnsWarn: 7,
        rfc5321: 15,
        cfws: 31,
        deprecated: 63,
        rfc5322: 127,
        error: 255
      },
      diagnoses: {
        // Address is valid
        valid: 0,
        // Address is valid for SMTP but has unusual elements
        rfc5321TLD: 9,
        rfc5321TLDNumeric: 10,
        rfc5321QuotedString: 11,
        rfc5321AddressLiteral: 12,
        // Address is valid for message, but must be modified for envelope
        cfwsComment: 17,
        cfwsFWS: 18,
        // Address contains non-ASCII when the allowUnicode option is false
        // Has to be > internals.defaultThreshold so that it's rejected
        // without an explicit errorLevel:
        undesiredNonAscii: 25,
        // Address contains deprecated elements, but may still be valid in some contexts
        deprecatedLocalPart: 33,
        deprecatedFWS: 34,
        deprecatedQTEXT: 35,
        deprecatedQP: 36,
        deprecatedComment: 37,
        deprecatedCTEXT: 38,
        deprecatedIPv6: 39,
        deprecatedCFWSNearAt: 49,
        // Address is only valid according to broad definition in RFC 5322, but is otherwise invalid
        rfc5322Domain: 65,
        rfc5322TooLong: 66,
        rfc5322LocalTooLong: 67,
        rfc5322DomainTooLong: 68,
        rfc5322LabelTooLong: 69,
        rfc5322DomainLiteral: 70,
        rfc5322DomainLiteralOBSDText: 71,
        rfc5322IPv6GroupCount: 72,
        rfc5322IPv62x2xColon: 73,
        rfc5322IPv6BadCharacter: 74,
        rfc5322IPv6MaxGroups: 75,
        rfc5322IPv6ColonStart: 76,
        rfc5322IPv6ColonEnd: 77,
        // Address is invalid for any purpose
        errExpectingDTEXT: 129,
        errNoLocalPart: 130,
        errNoDomain: 131,
        errConsecutiveDots: 132,
        errATEXTAfterCFWS: 133,
        errATEXTAfterQS: 134,
        errATEXTAfterDomainLiteral: 135,
        errExpectingQPair: 136,
        errExpectingATEXT: 137,
        errExpectingQTEXT: 138,
        errExpectingCTEXT: 139,
        errBackslashEnd: 140,
        errDotStart: 141,
        errDotEnd: 142,
        errDomainHyphenStart: 143,
        errDomainHyphenEnd: 144,
        errUnclosedQuotedString: 145,
        errUnclosedComment: 146,
        errUnclosedDomainLiteral: 147,
        errFWSCRLFx2: 148,
        errFWSCRLFEnd: 149,
        errCRNoLF: 150,
        errUnknownTLD: 160,
        errDomainTooShort: 161,
        errDotAfterDomainLiteral: 162
      },
      components: {
        localpart: 0,
        domain: 1,
        literal: 2,
        contextComment: 3,
        contextFWS: 4,
        contextQuotedString: 5,
        contextQuotedPair: 6
      }
    };
    internals.specials = (function() {
      const specials = '()<>[]:;@\\,."';
      const lookup = new Array(256);
      lookup.fill(false);
      for (let i = 0; i < specials.length; ++i) {
        lookup[specials.codePointAt(i)] = true;
      }
      return function(code) {
        return lookup[code];
      };
    })();
    internals.c0Controls = (function() {
      const lookup = new Array(256);
      lookup.fill(false);
      for (let i = 0; i < 33; ++i) {
        lookup[i] = true;
      }
      return function(code) {
        return lookup[code];
      };
    })();
    internals.c1Controls = (function() {
      const lookup = new Array(256);
      lookup.fill(false);
      for (let i = 127; i < 160; ++i) {
        lookup[i] = true;
      }
      return function(code) {
        return lookup[code];
      };
    })();
    internals.regex = {
      ipV4: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
      ipV6: /^[a-fA-F\d]{0,4}$/
    };
    internals.normalizeSupportsNul = "\0".normalize("NFC") === "\0";
    internals.nulNormalize = function(email) {
      return email.split("\0").map((part) => part.normalize("NFC")).join("\0");
    };
    internals.normalize = function(email) {
      return email.normalize("NFC");
    };
    if (!internals.normalizeSupportsNul) {
      internals.normalize = function(email) {
        if (email.indexOf("\0") >= 0) {
          return internals.nulNormalize(email);
        }
        return email.normalize("NFC");
      };
    }
    internals.checkIpV6 = function(items) {
      return items.every((value) => internals.regex.ipV6.test(value));
    };
    internals.isIterable = Array.isArray;
    if (typeof Symbol !== "undefined") {
      internals.isIterable = (value) => Array.isArray(value) || !!value && typeof value === "object" && typeof value[Symbol.iterator] === "function";
    }
    internals._isSet = (value) => value instanceof Set;
    internals._isMap = (value) => value instanceof Map;
    internals.isSet = Util.types && Util.types.isSet || internals._isSet;
    internals.isMap = Util.types && Util.types.isMap || internals._isMap;
    internals.normalizeTable = function(table) {
      if (internals.isSet(table) || Array.isArray(table)) {
        return table;
      }
      if (internals.isMap(table)) {
        return table.keys();
      }
      return Object.keys(table);
    };
    internals.canonicalizeAtom = function(atom) {
      return Punycode.toASCII(atom).toLowerCase();
    };
    internals.includesMapped = function(iterable, iteratee, value) {
      for (const item of iterable) {
        if (value === iteratee(item)) {
          return true;
        }
      }
      return false;
    };
    internals.validDomain = function(tldAtom, options) {
      const canonicalTldAtom = internals.canonicalizeAtom(tldAtom);
      if (options.tldBlacklist) {
        return !internals.includesMapped(
          internals.normalizeTable(options.tldBlacklist),
          internals.canonicalizeAtom,
          canonicalTldAtom
        );
      }
      return internals.includesMapped(
        internals.normalizeTable(options.tldWhitelist),
        internals.canonicalizeAtom,
        canonicalTldAtom
      );
    };
    internals.hasDomainLiteralThenAtom = function(domainAtoms) {
      let hasDomainLiteral = false;
      for (let i = 0; i < domainAtoms.length; ++i) {
        if (domainAtoms[i][0] === "[") {
          hasDomainLiteral = true;
        } else if (hasDomainLiteral) {
          return true;
        }
      }
      return false;
    };
    exports.validate = internals.validate = function(email, options, callback) {
      options = options || {};
      if (typeof email !== "string") {
        throw new TypeError("expected string email");
      }
      email = internals.normalize(email);
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      if (typeof callback !== "function") {
        callback = null;
      }
      let diagnose;
      let threshold;
      if (typeof options.errorLevel === "number") {
        diagnose = true;
        threshold = options.errorLevel;
      } else {
        diagnose = !!options.errorLevel;
        threshold = internals.diagnoses.valid;
      }
      if (options.tldWhitelist) {
        if (typeof options.tldWhitelist === "string") {
          options.tldWhitelist = [options.tldWhitelist];
        } else if (typeof options.tldWhitelist !== "object") {
          throw new TypeError("expected array or object tldWhitelist");
        }
      }
      if (options.tldBlacklist) {
        if (typeof options.tldBlacklist === "string") {
          options.tldBlacklist = [options.tldBlacklist];
        } else if (typeof options.tldBlacklist !== "object") {
          throw new TypeError("expected array or object tldBlacklist");
        }
      }
      if (options.minDomainAtoms && (options.minDomainAtoms !== (+options.minDomainAtoms | 0) || options.minDomainAtoms < 0)) {
        throw new TypeError("expected positive integer minDomainAtoms");
      }
      if (options.excludeDiagnoses) {
        if (!internals.isIterable(options.excludeDiagnoses)) {
          throw new TypeError("expected iterable excludeDiagnoses");
        }
        if (!internals.isSet(options.excludeDiagnoses)) {
          options.excludeDiagnoses = new Set(options.excludeDiagnoses);
        }
      }
      let maxResult = internals.diagnoses.valid;
      const updateResult = (value) => {
        if (value > maxResult && (!options.excludeDiagnoses || !options.excludeDiagnoses.has(value))) {
          maxResult = value;
        }
      };
      const allowUnicode = options.allowUnicode === void 0 || !!options.allowUnicode;
      if (!allowUnicode && /[^\x00-\x7f]/.test(email)) {
        updateResult(internals.diagnoses.undesiredNonAscii);
      }
      const context = {
        now: internals.components.localpart,
        prev: internals.components.localpart,
        stack: [internals.components.localpart]
      };
      let prevToken = "";
      const parseData = {
        local: "",
        domain: ""
      };
      const atomData = {
        locals: [""],
        domains: [""]
      };
      let elementCount = 0;
      let elementLength = 0;
      let crlfCount = 0;
      let charCode;
      let hyphenFlag = false;
      let assertEnd = false;
      const emailLength = email.length;
      let token;
      for (let i = 0; i < emailLength; i += token.length) {
        token = String.fromCodePoint(email.codePointAt(i));
        switch (context.now) {
          // Local-part
          case internals.components.localpart:
            switch (token) {
              // Comment
              case "(":
                if (elementLength === 0) {
                  updateResult(elementCount === 0 ? internals.diagnoses.cfwsComment : internals.diagnoses.deprecatedComment);
                } else {
                  updateResult(internals.diagnoses.cfwsComment);
                  assertEnd = true;
                }
                context.stack.push(context.now);
                context.now = internals.components.contextComment;
                break;
              // Next dot-atom element
              case ".":
                if (elementLength === 0) {
                  updateResult(elementCount === 0 ? internals.diagnoses.errDotStart : internals.diagnoses.errConsecutiveDots);
                } else {
                  if (assertEnd) {
                    updateResult(internals.diagnoses.deprecatedLocalPart);
                  }
                  assertEnd = false;
                  elementLength = 0;
                  ++elementCount;
                  parseData.local += token;
                  atomData.locals[elementCount] = "";
                }
                break;
              // Quoted string
              case '"':
                if (elementLength === 0) {
                  updateResult(elementCount === 0 ? internals.diagnoses.rfc5321QuotedString : internals.diagnoses.deprecatedLocalPart);
                  parseData.local += token;
                  atomData.locals[elementCount] += token;
                  elementLength += Buffer.byteLength(token, "utf8");
                  assertEnd = true;
                  context.stack.push(context.now);
                  context.now = internals.components.contextQuotedString;
                } else {
                  updateResult(internals.diagnoses.errExpectingATEXT);
                }
                break;
              // Folding white space
              case "\r":
                if (emailLength === ++i || email[i] !== "\n") {
                  updateResult(internals.diagnoses.errCRNoLF);
                  break;
                }
              // Fallthrough
              case " ":
              case "	":
                if (elementLength === 0) {
                  updateResult(elementCount === 0 ? internals.diagnoses.cfwsFWS : internals.diagnoses.deprecatedFWS);
                } else {
                  assertEnd = true;
                }
                context.stack.push(context.now);
                context.now = internals.components.contextFWS;
                prevToken = token;
                break;
              case "@":
                if (context.stack.length !== 1) {
                  throw new Error("unexpected item on context stack");
                }
                if (parseData.local.length === 0) {
                  updateResult(internals.diagnoses.errNoLocalPart);
                } else if (elementLength === 0) {
                  updateResult(internals.diagnoses.errDotEnd);
                } else if (Buffer.byteLength(parseData.local, "utf8") > 64) {
                  updateResult(internals.diagnoses.rfc5322LocalTooLong);
                } else if (context.prev === internals.components.contextComment || context.prev === internals.components.contextFWS) {
                  updateResult(internals.diagnoses.deprecatedCFWSNearAt);
                }
                context.now = internals.components.domain;
                context.stack[0] = internals.components.domain;
                elementCount = 0;
                elementLength = 0;
                assertEnd = false;
                break;
              // ATEXT
              default:
                if (assertEnd) {
                  switch (context.prev) {
                    case internals.components.contextComment:
                    case internals.components.contextFWS:
                      updateResult(internals.diagnoses.errATEXTAfterCFWS);
                      break;
                    case internals.components.contextQuotedString:
                      updateResult(internals.diagnoses.errATEXTAfterQS);
                      break;
                    // $lab:coverage:off$
                    default:
                      throw new Error("more atext found where none is allowed, but unrecognized prev context: " + context.prev);
                  }
                } else {
                  context.prev = context.now;
                  charCode = token.codePointAt(0);
                  if (internals.specials(charCode) || internals.c0Controls(charCode) || internals.c1Controls(charCode)) {
                    updateResult(internals.diagnoses.errExpectingATEXT);
                  }
                  parseData.local += token;
                  atomData.locals[elementCount] += token;
                  elementLength += Buffer.byteLength(token, "utf8");
                }
            }
            break;
          case internals.components.domain:
            switch (token) {
              // Comment
              case "(":
                if (elementLength === 0) {
                  updateResult(elementCount === 0 ? internals.diagnoses.deprecatedCFWSNearAt : internals.diagnoses.deprecatedComment);
                } else {
                  assertEnd = true;
                  updateResult(internals.diagnoses.cfwsComment);
                }
                context.stack.push(context.now);
                context.now = internals.components.contextComment;
                break;
              // Next dot-atom element
              case ".":
                const punycodeLength = Punycode.toASCII(atomData.domains[elementCount]).length;
                if (elementLength === 0) {
                  updateResult(elementCount === 0 ? internals.diagnoses.errDotStart : internals.diagnoses.errConsecutiveDots);
                } else if (hyphenFlag) {
                  updateResult(internals.diagnoses.errDomainHyphenEnd);
                } else if (punycodeLength > 63) {
                  updateResult(internals.diagnoses.rfc5322LabelTooLong);
                }
                assertEnd = false;
                elementLength = 0;
                ++elementCount;
                atomData.domains[elementCount] = "";
                parseData.domain += token;
                break;
              // Domain literal
              case "[":
                if (atomData.domains[elementCount].length === 0) {
                  if (parseData.domain.length) {
                    updateResult(internals.diagnoses.errDotAfterDomainLiteral);
                  }
                  assertEnd = true;
                  elementLength += Buffer.byteLength(token, "utf8");
                  context.stack.push(context.now);
                  context.now = internals.components.literal;
                  parseData.domain += token;
                  atomData.domains[elementCount] += token;
                  parseData.literal = "";
                } else {
                  updateResult(internals.diagnoses.errExpectingATEXT);
                }
                break;
              // Folding white space
              case "\r":
                if (emailLength === ++i || email[i] !== "\n") {
                  updateResult(internals.diagnoses.errCRNoLF);
                  break;
                }
              // Fallthrough
              case " ":
              case "	":
                if (elementLength === 0) {
                  updateResult(elementCount === 0 ? internals.diagnoses.deprecatedCFWSNearAt : internals.diagnoses.deprecatedFWS);
                } else {
                  updateResult(internals.diagnoses.cfwsFWS);
                  assertEnd = true;
                }
                context.stack.push(context.now);
                context.now = internals.components.contextFWS;
                prevToken = token;
                break;
              // This must be ATEXT
              default:
                if (assertEnd) {
                  switch (context.prev) {
                    case internals.components.contextComment:
                    case internals.components.contextFWS:
                      updateResult(internals.diagnoses.errATEXTAfterCFWS);
                      break;
                    case internals.components.literal:
                      updateResult(internals.diagnoses.errATEXTAfterDomainLiteral);
                      break;
                    // $lab:coverage:off$
                    default:
                      throw new Error("more atext found where none is allowed, but unrecognized prev context: " + context.prev);
                  }
                }
                charCode = token.codePointAt(0);
                hyphenFlag = false;
                if (internals.specials(charCode) || internals.c0Controls(charCode) || internals.c1Controls(charCode)) {
                  updateResult(internals.diagnoses.errExpectingATEXT);
                } else if (token === "-") {
                  if (elementLength === 0) {
                    updateResult(internals.diagnoses.errDomainHyphenStart);
                  }
                  hyphenFlag = true;
                } else if (charCode < 48 || charCode > 122 && charCode < 192 || charCode > 57 && charCode < 65 || charCode > 90 && charCode < 97) {
                  updateResult(internals.diagnoses.rfc5322Domain);
                }
                parseData.domain += token;
                atomData.domains[elementCount] += token;
                elementLength += Buffer.byteLength(token, "utf8");
            }
            break;
          // Domain literal
          case internals.components.literal:
            switch (token) {
              // End of domain literal
              case "]":
                if (maxResult < internals.categories.deprecated) {
                  let index = -1;
                  let addressLiteral = parseData.literal;
                  const matchesIP = internals.regex.ipV4.exec(addressLiteral);
                  if (matchesIP) {
                    index = matchesIP.index;
                    if (index !== 0) {
                      addressLiteral = addressLiteral.slice(0, index) + "0:0";
                    }
                  }
                  if (index === 0) {
                    updateResult(internals.diagnoses.rfc5321AddressLiteral);
                  } else if (addressLiteral.slice(0, 5).toLowerCase() !== "ipv6:") {
                    updateResult(internals.diagnoses.rfc5322DomainLiteral);
                  } else {
                    const match = addressLiteral.slice(5);
                    let maxGroups = internals.maxIPv6Groups;
                    const groups = match.split(":");
                    index = match.indexOf("::");
                    if (!~index) {
                      if (groups.length !== maxGroups) {
                        updateResult(internals.diagnoses.rfc5322IPv6GroupCount);
                      }
                    } else if (index !== match.lastIndexOf("::")) {
                      updateResult(internals.diagnoses.rfc5322IPv62x2xColon);
                    } else {
                      if (index === 0 || index === match.length - 2) {
                        ++maxGroups;
                      }
                      if (groups.length > maxGroups) {
                        updateResult(internals.diagnoses.rfc5322IPv6MaxGroups);
                      } else if (groups.length === maxGroups) {
                        updateResult(internals.diagnoses.deprecatedIPv6);
                      }
                    }
                    if (match[0] === ":" && match[1] !== ":") {
                      updateResult(internals.diagnoses.rfc5322IPv6ColonStart);
                    } else if (match[match.length - 1] === ":" && match[match.length - 2] !== ":") {
                      updateResult(internals.diagnoses.rfc5322IPv6ColonEnd);
                    } else if (internals.checkIpV6(groups)) {
                      updateResult(internals.diagnoses.rfc5321AddressLiteral);
                    } else {
                      updateResult(internals.diagnoses.rfc5322IPv6BadCharacter);
                    }
                  }
                } else {
                  updateResult(internals.diagnoses.rfc5322DomainLiteral);
                }
                parseData.domain += token;
                atomData.domains[elementCount] += token;
                elementLength += Buffer.byteLength(token, "utf8");
                context.prev = context.now;
                context.now = context.stack.pop();
                break;
              case "\\":
                updateResult(internals.diagnoses.rfc5322DomainLiteralOBSDText);
                context.stack.push(context.now);
                context.now = internals.components.contextQuotedPair;
                break;
              // Folding white space
              case "\r":
                if (emailLength === ++i || email[i] !== "\n") {
                  updateResult(internals.diagnoses.errCRNoLF);
                  break;
                }
              // Fallthrough
              case " ":
              case "	":
                updateResult(internals.diagnoses.cfwsFWS);
                context.stack.push(context.now);
                context.now = internals.components.contextFWS;
                prevToken = token;
                break;
              // DTEXT
              default:
                charCode = token.codePointAt(0);
                if (charCode !== 127 && internals.c1Controls(charCode) || charCode === 0 || token === "[") {
                  updateResult(internals.diagnoses.errExpectingDTEXT);
                  break;
                } else if (internals.c0Controls(charCode) || charCode === 127) {
                  updateResult(internals.diagnoses.rfc5322DomainLiteralOBSDText);
                }
                parseData.literal += token;
                parseData.domain += token;
                atomData.domains[elementCount] += token;
                elementLength += Buffer.byteLength(token, "utf8");
            }
            break;
          // Quoted string
          case internals.components.contextQuotedString:
            switch (token) {
              // Quoted pair
              case "\\":
                context.stack.push(context.now);
                context.now = internals.components.contextQuotedPair;
                break;
              // Folding white space. Spaces are allowed as regular characters inside a quoted string - it's only FWS if we include '\t' or '\r\n'
              case "\r":
                if (emailLength === ++i || email[i] !== "\n") {
                  updateResult(internals.diagnoses.errCRNoLF);
                  break;
                }
              // Fallthrough
              case "	":
                parseData.local += " ";
                atomData.locals[elementCount] += " ";
                elementLength += Buffer.byteLength(token, "utf8");
                updateResult(internals.diagnoses.cfwsFWS);
                context.stack.push(context.now);
                context.now = internals.components.contextFWS;
                prevToken = token;
                break;
              // End of quoted string
              case '"':
                parseData.local += token;
                atomData.locals[elementCount] += token;
                elementLength += Buffer.byteLength(token, "utf8");
                context.prev = context.now;
                context.now = context.stack.pop();
                break;
              // QTEXT
              default:
                charCode = token.codePointAt(0);
                if (charCode !== 127 && internals.c1Controls(charCode) || charCode === 0 || charCode === 10) {
                  updateResult(internals.diagnoses.errExpectingQTEXT);
                } else if (internals.c0Controls(charCode) || charCode === 127) {
                  updateResult(internals.diagnoses.deprecatedQTEXT);
                }
                parseData.local += token;
                atomData.locals[elementCount] += token;
                elementLength += Buffer.byteLength(token, "utf8");
            }
            break;
          // Quoted pair
          case internals.components.contextQuotedPair:
            charCode = token.codePointAt(0);
            if (charCode !== 127 && internals.c1Controls(charCode)) {
              updateResult(internals.diagnoses.errExpectingQPair);
            } else if (charCode < 31 && charCode !== 9 || charCode === 127) {
              updateResult(internals.diagnoses.deprecatedQP);
            }
            context.prev = context.now;
            context.now = context.stack.pop();
            const escapeToken = "\\" + token;
            switch (context.now) {
              case internals.components.contextComment:
                break;
              case internals.components.contextQuotedString:
                parseData.local += escapeToken;
                atomData.locals[elementCount] += escapeToken;
                elementLength += 2;
                break;
              case internals.components.literal:
                parseData.domain += escapeToken;
                atomData.domains[elementCount] += escapeToken;
                elementLength += 2;
                break;
              // $lab:coverage:off$
              default:
                throw new Error("quoted pair logic invoked in an invalid context: " + context.now);
            }
            break;
          // Comment
          case internals.components.contextComment:
            switch (token) {
              // Nested comment
              case "(":
                context.stack.push(context.now);
                context.now = internals.components.contextComment;
                break;
              // End of comment
              case ")":
                context.prev = context.now;
                context.now = context.stack.pop();
                break;
              // Quoted pair
              case "\\":
                context.stack.push(context.now);
                context.now = internals.components.contextQuotedPair;
                break;
              // Folding white space
              case "\r":
                if (emailLength === ++i || email[i] !== "\n") {
                  updateResult(internals.diagnoses.errCRNoLF);
                  break;
                }
              // Fallthrough
              case " ":
              case "	":
                updateResult(internals.diagnoses.cfwsFWS);
                context.stack.push(context.now);
                context.now = internals.components.contextFWS;
                prevToken = token;
                break;
              // CTEXT
              default:
                charCode = token.codePointAt(0);
                if (charCode === 0 || charCode === 10 || charCode !== 127 && internals.c1Controls(charCode)) {
                  updateResult(internals.diagnoses.errExpectingCTEXT);
                  break;
                } else if (internals.c0Controls(charCode) || charCode === 127) {
                  updateResult(internals.diagnoses.deprecatedCTEXT);
                }
            }
            break;
          // Folding white space
          case internals.components.contextFWS:
            if (prevToken === "\r") {
              if (token === "\r") {
                updateResult(internals.diagnoses.errFWSCRLFx2);
                break;
              }
              if (++crlfCount > 1) {
                updateResult(internals.diagnoses.deprecatedFWS);
              } else {
                crlfCount = 1;
              }
            }
            switch (token) {
              case "\r":
                if (emailLength === ++i || email[i] !== "\n") {
                  updateResult(internals.diagnoses.errCRNoLF);
                }
                break;
              case " ":
              case "	":
                break;
              default:
                if (prevToken === "\r") {
                  updateResult(internals.diagnoses.errFWSCRLFEnd);
                }
                crlfCount = 0;
                context.prev = context.now;
                context.now = context.stack.pop();
                --i;
            }
            prevToken = token;
            break;
          // Unexpected context
          // $lab:coverage:off$
          default:
            throw new Error("unknown context: " + context.now);
        }
        if (maxResult > internals.categories.rfc5322) {
          break;
        }
      }
      if (maxResult < internals.categories.rfc5322) {
        const punycodeLength = Punycode.toASCII(parseData.domain).length;
        if (context.now === internals.components.contextQuotedString) {
          updateResult(internals.diagnoses.errUnclosedQuotedString);
        } else if (context.now === internals.components.contextQuotedPair) {
          updateResult(internals.diagnoses.errBackslashEnd);
        } else if (context.now === internals.components.contextComment) {
          updateResult(internals.diagnoses.errUnclosedComment);
        } else if (context.now === internals.components.literal) {
          updateResult(internals.diagnoses.errUnclosedDomainLiteral);
        } else if (token === "\r") {
          updateResult(internals.diagnoses.errFWSCRLFEnd);
        } else if (parseData.domain.length === 0) {
          updateResult(internals.diagnoses.errNoDomain);
        } else if (elementLength === 0) {
          updateResult(internals.diagnoses.errDotEnd);
        } else if (hyphenFlag) {
          updateResult(internals.diagnoses.errDomainHyphenEnd);
        } else if (punycodeLength > 255) {
          updateResult(internals.diagnoses.rfc5322DomainTooLong);
        } else if (Buffer.byteLength(parseData.local, "utf8") + punycodeLength + /* '@' */
        1 > 254) {
          updateResult(internals.diagnoses.rfc5322TooLong);
        } else if (elementLength > 63) {
          updateResult(internals.diagnoses.rfc5322LabelTooLong);
        } else if (options.minDomainAtoms && atomData.domains.length < options.minDomainAtoms && (atomData.domains.length !== 1 || atomData.domains[0][0] !== "[")) {
          updateResult(internals.diagnoses.errDomainTooShort);
        } else if (internals.hasDomainLiteralThenAtom(atomData.domains)) {
          updateResult(internals.diagnoses.errDotAfterDomainLiteral);
        } else if (options.tldWhitelist || options.tldBlacklist) {
          const tldAtom = atomData.domains[elementCount];
          if (!internals.validDomain(tldAtom, options)) {
            updateResult(internals.diagnoses.errUnknownTLD);
          }
        }
      }
      if (maxResult < internals.categories.dnsWarn) {
        const code = atomData.domains[elementCount].codePointAt(0);
        if (code <= 57) {
          updateResult(internals.diagnoses.rfc5321TLDNumeric);
        }
      }
      if (maxResult < threshold) {
        maxResult = internals.diagnoses.valid;
      }
      const finishResult = diagnose ? maxResult : maxResult < internals.defaultThreshold;
      if (callback) {
        callback(finishResult);
      }
      return finishResult;
    };
    exports.diagnoses = internals.validate.diagnoses = (function() {
      const diag = {};
      const keys = Object.keys(internals.diagnoses);
      for (let i = 0; i < keys.length; ++i) {
        const key = keys[i];
        diag[key] = internals.diagnoses[key];
      }
      return diag;
    })();
    exports.normalize = internals.normalize;
  }
});

// <stdin>
var import_isemail = __toESM(require_lib());
var export_default = import_isemail.default;
export {
  export_default as default
};
