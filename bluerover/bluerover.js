/**
 * BlueRover Stream API Module for Node.js
 *
 * Written By: Andrew Hassan
 * January 12, 2013
 */

var urlUtil = require('url'),
    crypto = require('crypto'),
    querystring = require('querystring'),
    http = require('http');

function isEmpty(str) {
    return str === "";
}

function isNull(str) {
    return str === null || typeof(str) === 'undefined';
}

function isNullOrEmpty(str) {
    return isNull(str) || isEmpty(str);
}

module.exports = BlueRoverApi;

function BlueRoverApi(key, token, baseUrl) {
    if (isNullOrEmpty(key) || isNullOrEmpty(token) || isNullOrEmpty(baseUrl)) {
        throw new Error("BlueRover API: key, token, and base URL must contain valid values.");
    }
    this.key = key;
    this.token = token;
    this.baseUrl = baseUrl;
}

function oauthEscape(val) {
    return encodeURIComponent(val);
}

function hmacSha1(key, data) {
    return crypto.createHmac('sha1', key).update(data).digest('base64');
}

function oauthHmacSha1(key, str) {
    return hmacSha1(key, str).toString("base64");
}

function ksort(obj) {
    var sortedKeys = Object.keys(obj).sort(function(a, b) {
        if (a == b) {
            return 0;
        }
        if (a < b) {
            return -1;
        }
        if (a > b) {
            return 1;
        }
    });

    result = {};

    for (var key in sortedKeys) {
        result[sortedKeys[key]] = obj[sortedKeys[key]];
    }

    return result;
}

function generateSignature(key, method, url, params) {
    params = params || {};

    var decomposedUrl = urlUtil.parse(url);
    var protocol = decomposedUrl['protocol'],
        hostname = decomposedUrl['hostname'],
        path = decomposedUrl['path'];

    var normalizedUrl = protocol.toLowerCase() + "//" + hostname.toLowerCase() + path;

    var baseElements = [method.toUpperCase(), normalizedUrl];
    params = ksort(params);

    var combinedParams = [];
    for (var k in params) {
        combinedParams.push(k + "=" + params[k]);
    }
    var combinedParamString = combinedParams.join('&');
    baseElements.push(combinedParamString);

    var escapedBase = [];
    for(var element in baseElements) {
        escapedBase.push(oauthEscape(baseElements[element]));
    }

    var baseString = escapedBase.join('&');

    return oauthHmacSha1(key, baseString);

}

BlueRoverApi.setCredentials = function (credentials) {
    key = credentials['key'];
    token = credentials['token'];
    baseUrl = credentials['baseUrl'];

    if (isNullOrEmpty(key) || isNullOrEmpty(token) || isNullOrEmpty(baseUrl)) {
        throw new Error("BlueRover API: key, token, and base URL must contain valid values.");
    }

    this.key = key;
    this.token = token;
    this.baseUrl = baseUrl;
}

BlueRoverApi.stream = function(callback, relativeUrl) {
    // Set default values
    callback = callback || function(){};
    relativeUrl = relativeUrl || '/eventstream';

    // Set the endpoint URL
    var endpoint = this.baseUrl + relativeUrl;

    // Generate the auth signature
    var signature = generateSignature(this.key, "GET", endpoint, {});

    // Parse the URL and generate the http request options
    var parsedUrl = urlUtil.parse(endpoint);
    var options = {
        host: parsedUrl['host'],
        path: parsedUrl['path'],
        headers: {
            "Authorization": "BR " + this.token + ":" + signature,
            'Connection': 'keep-alive'
        }
    };

    // Create the request
    var request = http.request(options, function(response) {
        response.socket.setTimeout(4*60*1000, function() {
            response.socket.destroy();
            console.log("Socket connection timed out, resetting stream connection");
            setTimeout(BlueRoverApi.restartStream(callback,relativeUrl),2000);
        });
        // On data, call the callback function
        response.on('data', function(data) {
            callback(data);
        });

        response.socket.on("close",function() {
            response.socket.destroy();
            console.log("Socket connection closed, resetting stream connection");
            setTimeout(BlueRoverApi.restartStream(callback,relativeUrl),2000);
        });
    });

    request.on('error', function(e) {
        console.log("There was an error connecting to the stream API: " + e.toString());
        setTimeout(BlueRoverApi.restartStream(callback,relativeUrl),4*60*1000);
    });

    // Make the request
    request.end();
}

BlueRoverApi.call = function (relativeUrl, params, callback, post) {
    // The BlueRover API doesn't support POST requests yet
    if (post) console.log("The BlueRover API doesn't support POST requests yet");
    post = false;

    params = params || {};
    callback = callback || function(){};

    params = ksort(params);

    var url = this.baseUrl + relativeUrl;
    var method = "GET";

    if (post) {
        method = "POST";
    }

    var signature = generateSignature(this.key, method, url, params);

    if (!post) {
        var qs = querystring.encode(params);

        if (!isEmpty(qs)) {
            qs = "?" + qs;
        }


        var endpoint = url + qs;
        var parsedUrl = urlUtil.parse(endpoint);
        var options = {
            host: parsedUrl['host'],
            path: parsedUrl['path'],
            headers: {
                "Authorization": "BR " + this.token + ":" + signature
            }
        };

        var request = http.request(options, function(response) {
            var strData = "";

            response.on('data', function(data) {
                //console.log(strData);
                strData += data.toString('utf-8');
            });

            response.on('end', function() {
                callback(strData);
            })
        });

        request.end();
    }
    else {
        throw new Error("BlueRover API: POST is not supported yet.");
    }
}

BlueRoverApi.restartStream = function(callback, relativeUrl) {
    BlueRoverApi.stream(callback,relativeUrl);
}
