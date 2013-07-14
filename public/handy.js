// some handy functions
handy = {
  urlRE: /https?:\/\/([-\w\.]+)+(:\d+)?(\/([^\s]*(\?\S+)?)?)?/g,

  // html sanitizer
  toStaticHTML: function(inputHtml){
    inputHtml = inputHtml.toString();
    return inputHtml.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  },

  // pads n with zeros on the left,
  // digits is minimum length of output
  // zeroPad(3, 5); returns "005"
  // zeroPad(2, 500); returns "500"
  zeroPad: function(digits, n){
    n = n.toString();
    while (n.length < digits)
      n = '0' + n;
    return n;
  },

  // it is almost 8 o'clock PM here
  // timeString(new Date); returns "19:49"
  timeString: function(date){
    var seconds = date.getSeconds().toString();
    var minutes = date.getMinutes().toString();
    var hours = date.getHours().toString();
    return this.zeroPad(2, hours) + ":" + this.zeroPad(2, minutes) + ":" + this.zeroPad(2, seconds);
  },

  // does the argument only contain whitespace?
  isBlank: function(text){
    var blank = /^\s*$/;
    return (text.match(blank) !== null);
  },

  // sets a cookie called `key` with a value of `value` which expires in
  // `expire` expressed in milliseconds.
  //
  // setCookie('ahoy', 'sea', 10 * 1000); creates a cookie called 'ahoy' with value 'sea' for ten seconds.
  setCookie: function(key, value, expire){
    var expires = new Date();
    expires.setTime(expires.getTime() + expire);
    document.cookie = key + "=" + value + ";expires=" + expires.toUTCString() + ';path="/"';
  },

  // getCookie('ahoy'); returns 'sea'
  getCookie: function(key){
    var keyValue = document.cookie.match('(^|;) ?' + key + '=([^;]*)(;|$)');
    return keyValue ? keyValue[2] : null;
  }
};

if (typeof module !== "undefined" && typeof module.exports !== "undefined"){
  module.exports = handy;
}
