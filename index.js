/**
 *
 * Created by Valentin Heun on 1/10/17.
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2017 Valentin Heun
 *
 * This Library is build on code fragments from rolling-spider (The MIT License) by Jack Watson-Hamblin
 * https://github.com/voodootikigod/node-rolling-spider
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 *
 */



var noble = require('noble');
var debug = require('debug')('wedo 2.0');
var EventEmitter = require('events').EventEmitter;

var util = require('util');
var _ = require('lodash');

function Device() {
	this.name = "";
	this.uuid = "";
	this.isConnected = false;
	this.port = [new Port(), new Port()];
}

function Port() {
	this.connected = 0;
	this.type = "none";
	this.runMotor = null;
	this.motorResult = 127;
	this.value = [0, 0, 0];
}

/**
 * Constructs a new WeDo 2.0
 *
 * @param {Object} options to construct the drone with:
 *  - {String} uuid to connect to. If this is omitted then it will connect to the first device representing a WeDo device.
 *  - cout function to call if/when errors occur. If omitted then uses console#log
 * @constructor
 */

var WeDo2 = function (options) {

	this.battery = "180f";
	this.button = "1526";
	this.portType = "1527";
	this.lowVoltageAlert = "1528";
	this.highCurrentAlert = "1529";
	this.lowSignalAlert = "152a";
	this.sensorValue = "1560";
	this.valueformat = "1561";
	this.nameID = "1524";

	this.runMotor = null;
	this.motorResult = 127;
	this.pingMotor();

	var uuid = (typeof options === 'string' ? options : undefined);
	options = options || {};

	this.wedo = {
		devices: [new Device()]
	};

	this.uuid = null;
	this.targets = uuid || options.uuid;

	if (this.targets && !util.isArray(this.targets)) {
		this.targets = this.targets.split(',');
	}

	this.forceConnect = options.forceConnect || false;
	this.connected = false;
	this.discovered = false;
	this.ble = noble;
	this.peripheral = null;

	this.status = {
		stateValue: 0,
		battery: 100
	};

	// handle disconnect gracefully
	this.ble.on('warning', function (message) {
		this.onDisconnect();
	}.bind(this));



	process.on('exit', function () {
		this.disconnect();
		console.log("exit");
		process.exit();
	}.bind(this));

	process.on('uncaughtException', function (e) {
		this.disconnect();
		console.log("uncaughtException");
		console.log(e);
		process.exit();
	}.bind(this));

	process.on('SIGINT', function () {
		this.disconnect();
		console.log("exit");
		process.exit();
	}.bind(this));




};

util.inherits(WeDo2, EventEmitter);

/**
 * WeDo2.isWeDoPeripheral
 *
 * Accepts a BLE peripheral object record and returns true|false
 * if that record represents a WeDo 2.0 Controller or not.
 *
 * @param  {Object}  peripheral A BLE peripheral record
 * @return {Boolean}
 */
WeDo2.isWeDoPeripheral = function (peripheral) {
	if (!peripheral) {
		return false;
	}

	//console.log("-------------");
	var localName = peripheral.advertisement.localName;
	var manufacturer = peripheral.advertisement.serviceUuids;

	console.log(localName + ": " + manufacturer);

	var weDoServiceID = "000015231212efde1523785feabcd123";
	var weDoName = "LPF2 Smart Hub 2 I/O";

	//console.log(weDoName);

	var localNameMatch = localName && localName.indexOf(weDoName) === 0;
	var manufacturerMatch = manufacturer && manufacturer.indexOf(weDoServiceID) === 0; //manufacturer.toString('hex')

	// Is true for EITHER an "Wedo Name" name OR the right Service ID code.
	return localNameMatch || manufacturerMatch;
};
// create client helper function to match ar-drone
WeDo2.createClient = function (options) {
	return new WeDo2(options);
};

/**
 * Sets up the connection to the WeDo 2.0 controller and enumerate all of the services and characteristics.
 *
 *
 * @param callback to be called once set up
 * @private
 */
WeDo2.prototype.setup = function (callback) {
	this.cout('WeDo 2.0 Setup');
	this.peripheral.discoverAllServicesAndCharacteristics(function (error, services, characteristics) {
		if (error) {
			if (typeof callback === 'function') {
				callback(error);
			}
		} else {
			this.services = services;
			this.characteristics = characteristics;

			//console.log(characteristics);
			this.handshake(callback);

		}
	}.bind(this));
};

/**
 * Connects to the WeDo 2.0 controller over BLE
 *
 * @param callback to be called once connected
 * @todo Make the callback be called with an error if encountered
 */
WeDo2.prototype.connect = function (callback) {

	this.cout('WeDo Connect');
	if (this.targets) {
		this.cout('WeDo 2.0 controller finding: ' + this.targets.join(', '));
	}

	this.ble.on('discover', function (peripheral) {
		//this.cout(peripheral);

		var isFound = false;
		var connectedRun = false;
		var matchType = 'Fuzzy';

		// Peripheral specific
		var localName = peripheral.advertisement.localName;
		var uuid = peripheral.uuid;

		// Is this peripheral a Parrot Rolling Spider?
		var isWeDo = WeDo2.isWeDoPeripheral(peripheral);

		var onConnected = function (error) {
			if (connectedRun) {
				return;
			} else {
				connectedRun = true;
			}
			if (error) {
				if (typeof callback === 'function') {
					callback(error);
				}
			} else {
				this.cout('Connected to: ' + localName);
				this.ble.stopScanning();
				this.connected = true;
				this.setup(callback);
			}
		}.bind(this);

		if (this.targets) {
			this.cout(this.targets.indexOf(uuid));
			this.cout(this.targets.indexOf(localName));
		}

		if (!this.discovered) {

			if (this.targets &&
				(this.targets.indexOf(uuid) >= 0 || this.targets.indexOf(localName) >= 0)) {
				matchType = 'Exact';
				isFound = true;
			} else if ((typeof this.targets === 'undefined' || this.targets.length === 0) && isWeDo) {
				isFound = true;
			}

			if (isFound) {
				this.cout(matchType + ' match found: ' + localName + ' <' + uuid + '>');
				this.connectPeripheral(peripheral, onConnected);
			}
		}
	}.bind(this));

	if (this.forceConnect || this.ble.state === 'poweredOn') {
		this.cout('WeDo2.forceConnect');
		this.ble.startScanning();
	} else {
		this.cout('WeDo2.on(stateChange)');
		this.ble.on('stateChange', function (state) {
			if (state === 'poweredOn') {
				this.cout('WeDo2#poweredOn');
				this.ble.startScanning();
			} else {
				this.cout('stateChange == ' + state);
				this.ble.stopScanning();
				if (typeof callback === 'function') {
					callback(new Error('Error with Bluetooth Adapter, please retry'));
				}
			}
		}.bind(this));
	}
};

WeDo2.prototype.connectPeripheral = function (peripheral, onConnected) {
	this.discovered = true;
	this.uuid = peripheral.uuid;
	this.name = peripheral.advertisement.localName;
	this.peripheral = peripheral;
	this.peripheral.connect(onConnected);
	this.peripheral.on('disconnect', function () {
		this.onDisconnect();
	}.bind(this));
};

/**
 * Performs necessary handshake to initiate communication with the device. Also configures all notification handlers.
 *
 *
 * @param callback to be called once set up
 * @private
 */
WeDo2.prototype.handshake = function (callback) {
	this.cout('WeDo2#handshake');

	var listOfNotificationCharacteristics =
		[this.battery, this.button,
			this.portType, this.lowVoltageAlert,
			this.highCurrentAlert, this.lowSignalAlert,
			this.sensorValue, this.valueformat];

	listOfNotificationCharacteristics.forEach(function (key) {
		var characteristic = this.getCharacteristic(key);
		characteristic.notify(true);
	}.bind(this));

	// set LED lights to rgb values
	this.writePortDefinition(0x06, 0x17, 0x01, 0x02, function () {
		console.log("have set RGB for LED");
	}.bind(this));

	this.getCharacteristic(this.portType).on('data', function (data, isNotification) {
		if (!isNotification) {
			return;
		}
		if (data[0] === 1 || data[0] === 2) {
			var thisPort = this.wedo.devices[0].port[data[0] - 1];
			thisPort.connected = data[1];

			if (data[1]) {
				if (data[3] === 34) {
					thisPort.type = "tiltSensor";

					console.log("activate tilt sensor");
					//port, type, mode, format, callback
					this.writePortDefinition(data[0], data[3], 0x00, 0x01, function () {
						console.log("activated tilt sensor");
					});
				}

				if (data[3] === 35) {
					thisPort.type = "distanceSensor";
					this.writePortDefinition(data[0], data[3], 0x02, 0x00, function () {
						console.log("activated tilt sensor");
					});
				}
				if (data[3] === 1) {
					thisPort.type = "motor";
					this.writePortDefinition(data[0], data[3], 0x02, 0x00, function () {
						console.log("activated tilt sensor");
					});
				}
			} else {
				thisPort.type = "none";
			}

			console.log(JSON.stringify(this.wedo));
		}

	}.bind(this));

	this.getCharacteristic(this.sensorValue).on('data', function (data, isNotification) {
		if (!isNotification) {
			return;
		}
		if (data[1] === 1 || data[1] === 2) {
			if (this.wedo.devices[0].port[data[1] - 1].type === "tiltSensor") {
				this.sensorReadingX = data[2];
				if (this.sensorReadingX > 100) {
					this.sensorReadingX = -(255 - this.sensorReadingX);
				}
				this.sensorReadingY = data[3];
				if (this.sensorReadingY > 100) {
					this.sensorReadingY = -(255 - this.sensorReadingY);
				}

				this.emit('tiltSensor', parseInt(this.sensorReadingX * 2.55), parseInt(this.sensorReadingY * 2.55), data[1]);
			} else if (this.wedo.devices[0].port[data[1] - 1].type === "distanceSensor") {

				this.distanceValue = data[2];

				if(data[3] === 1){
					this.distanceValue = data[2]+255;
				}
				this.emit('distanceSensor', this.distanceValue, data[1]);
			}
		}

	}.bind(this));

	this.getCharacteristic(this.valueformat).on('data', function (data, isNotification) {
		if (!isNotification) {
			return;
		}
		console.log("valueformat");
		console.log(data)
	});

	// todo check which one is the battery
	// Register listener for battery notifications.
	this.getCharacteristic(this.battery).on('data', function (data, isNotification) {
		if (!isNotification) {
			return;
		}
		this.status.battery = data[data.length - 1];
		this.emit('battery', data[data.length - 1]);

		//this.cout('Battery level: ' + this.status.battery + '%');
	}.bind(this));

	this.getCharacteristic(this.button).on('data', function (data, isNotification) {
		if (!isNotification) {
			return;
		}

		this.emit('button', data[data.length - 1]);

		//this.cout('Battery level: ' + this.status.battery + '%');
	}.bind(this));

	callback();
};

/**
 * Gets a Characteristic by it's unique_uuid_segment
 *
 * @param {String} unique_uuid_segment
 * @returns Characteristic
 */

WeDo2.prototype.writePortDefinition = function (port, type, mode, format, callback) {
	this.writeTo("1563", Buffer([0x01, 0x02, port, type, mode, 0x01, 0x00, 0x00, 0x00, format, 0x01]), function () {
		callback();
	});
};
WeDo2.prototype.getCharacteristic = function (unique_uuid_segment) {
	var filtered = this.characteristics.filter(function (c) {
		return c.uuid.search(new RegExp(unique_uuid_segment)) !== -1;
	});

	if (!filtered[0]) {
		filtered = this.characteristics.filter(function (c) {
			return c._serviceUuid.search(new RegExp(unique_uuid_segment)) !== -1;
		});
	}
	return filtered[0];

};

/**
 * Writes a Buffer to a Characteristic by it's unique_uuid_segment
 *
 * @param {String} unique_uuid_segment
 * @param {Buffer} buffer
 */
WeDo2.prototype.writeTo = function (unique_uuid_segment, buffer, callback) {
	if (!this.characteristics) {
		var e = new Error('You must have bluetooth enabled and be connected to a drone before executing a command. Please ensure Bluetooth is enabled on your machine and you are connected.');
		if (callback) {
			callback(e);
		} else {
			throw e;
		}
	} else {
		if (typeof callback === 'function') {
			this.getCharacteristic(unique_uuid_segment).write(buffer, true, callback);
		} else {
			this.getCharacteristic(unique_uuid_segment).write(buffer, true);
		}
	}
};

WeDo2.prototype.onDisconnect = function () {
	if (this.connected) {
		this.cout('Disconnected from WeDo: ' + this.name);
		this.ble.removeAllListeners();
		this.connected = false;
		this.discovered = false;
		this.emit('disconnected');
	}
};

/**
 * 'Disconnects' from the drone
 *
 * @param callback to be called once disconnected
 */
WeDo2.prototype.disconnect = function (callback) {
	this.cout('WeDo 2.0 controller#disconnect');

	if (this.connected) {
		this.peripheral.disconnect(function (error) {
			this.onDisconnect();
			if (typeof callback === 'function') {
				callback(error);
			}
		}.bind(this));
	} else {
		if (typeof callback === 'function') {
			callback();
		}
	}
};

/**
 * Obtains the signal strength of the connected drone as a dBm metric.
 *
 * @param callback to be called once the signal strength has been identified
 */
WeDo2.prototype.getSignalStrength = function (callback) {
	if (this.connected) {
		this.peripheral.updateRssi(callback);
	} else {
		if (typeof callback === 'function') {
			callback(new Error('Not connected to device'));
		}
	}
};

WeDo2.prototype.getDeviceName = function (callback) {

	this.getCharacteristic(this.nameID).read(function (e, b) {
		console.log(b);
		this(b.toString());
	}.bind(callback));

};

WeDo2.prototype.setDeviceName = function (name) {
	this.writeTo(this.nameID, Buffer(name), function () {
	});
};

WeDo2.prototype.setLedColor = function (R, G, B) {

	this.writeTo("1565", Buffer([0x06, 0x04, 0x03, R, G, B]), function () {

	});
};

WeDo2.prototype.toBytesInt32 = function (num) {
	this.arr = new Uint8Array([
		(num & 0xff000000) >> 24,
		(num & 0x00ff0000) >> 16,
		(num & 0x0000ff00) >> 8,
		(num & 0x000000ff)
	]);
	return this.arr.buffer;
};

WeDo2.prototype.setMotor = function (speed, port) {

if(typeof port === "undefined") {
	port = null;
}
	this.runMotor = null;

	if(port !== null){
		if(port === 1 && port === 2)
		if(this.wedo.devices[0].port[port-1].type === "motor"){
			this.runMotor = port;
		}
	} else {

		if(this.wedo.devices[0].port[0].type === "motor"){

			this.runMotor = 0x01;
		} else if(this.wedo.devices[0].port[1].type === "motor"){
			this.runMotor = 0x02;
		}
	}

	if(this.runMotor !==null){
		console.log("moter: "+speed);

		if(speed>1 && speed <=100){
			this.motorResult = this.map(speed, 1, 100, 35, 100);
		} else if(speed<-1&& speed >=-100){
			this.motorResult = this.map(speed, -1, -100, 220, 155);
		} else {
			this.motorResult = 127;
		}
	}
};

WeDo2.prototype.pingMotor = function (){
	var self = this;

	setInterval(function () {
		if(self.runMotor !== null) {
			self.getCharacteristic("1565").write(Buffer([self.runMotor, 0x01, 0x02, parseInt(self.motorResult)], true));
		}
	}, 100);
};

WeDo2.prototype.map = function (x, in_min, in_max, out_min, out_max) {
	if (x > in_max) x = in_max;
	if (x < in_min) x = in_min;
	return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
};

WeDo2.prototype.cout = function (text) {
	console.log(text);
};

module.exports = WeDo2;