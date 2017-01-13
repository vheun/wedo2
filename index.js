/**
 *
 * Created by Valentin Heun on 1/10/17.
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2017 Valentin Heun
 *
 * This Library is build with code fragments from rolling-spider (MIT License) by Jack Watson-Hamblin
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

// todo battery needs to be better solved

var noble = require('noble');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

/**
 * Constructors for Objects
 */

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
}

/**
 * Constructs a new WeDo 2.0
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

	this.wedo = {};

	this.ble = noble;

	this.connect();

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
 * Connects to the WeDo 2.0 controller over BLE
 *
 * @param callback to be called once connected
 * @todo Make the callback be called with an error if encountered
 */
WeDo2.prototype.connect = function (callback) {

	this.cout('WeDo 2.0 Connect');

	this.ble.on('discover', function (peripheral) {
		if (this.isWeDoPeripheral(peripheral)) {
			if (!this.wedo[peripheral.uuid]) {

				this.wedo[peripheral.uuid] = new Device();
				this.wedo[peripheral.uuid].name = peripheral.advertisement.localName;
				this.wedo[peripheral.uuid].uuid = peripheral.uuid;
				this.wedo[peripheral.uuid].peripheral = peripheral;

				this.cout('Found the following WeDo: ' + peripheral.advertisement.localName + ' with UUID ' + peripheral.uuid);

				this.connectPeripheral(peripheral.uuid, function (uuid){

					this.emit('connected', uuid);

				}.bind(this,peripheral.uuid));
			}
		}
	}.bind(this));

	if (this.ble.state === 'poweredOn') {
		this.cout('WeDo2.forceConnect');
		this.ble.startScanning(null, true);
	} else {
		this.cout('WeDo2.on(stateChange)');
		this.ble.on('stateChange', function (state) {
			if (state === 'poweredOn') {
				this.cout('WeDo2 is poweredOn');
				this.ble.startScanning(null, true);
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

/**
 * WeDo2.isWeDoPeripheral
 *
 * Accepts a BLE peripheral object record and returns true|false
 * if that record represents a WeDo 2.0 Controller or not.
 *
 * @param  {Object}  peripheral A BLE peripheral record
 * @return {Boolean}
 */
WeDo2.prototype.isWeDoPeripheral = function (peripheral) {
	if (!peripheral) {
		return false;
	}

	var localName = peripheral.advertisement.localName;
	var manufacturer = peripheral.advertisement.serviceUuids;

	var weDoServiceID = "000015231212efde1523785feabcd123";
	var weDoName = "LPF2 Smart Hub 2 I/O";

	var localNameMatch = localName && localName.indexOf(weDoName) === 0;
	var manufacturerMatch = manufacturer && manufacturer.indexOf(weDoServiceID) === 0;

	return localNameMatch || manufacturerMatch;
};

/**
 * Sets up the connection to the WeDo 2.0 controller and enumerate all of the services and characteristics.
 *
 *
 * @param callback to be called once set up
 * @private
 */
WeDo2.prototype.setup = function (uuid, callback) {
	this.cout('Connected to: ' + this.wedo[uuid].peripheral.advertisement.localName);

	this.cout('Starting Setup for ' + uuid);
	this.wedo[uuid].peripheral.discoverAllServicesAndCharacteristics(function (error, services, characteristics) {
		if (error) {
			if (typeof callback === 'function') {
				console.log("error");
				callback(error);
			}
		} else {
			this.wedo[uuid].services = services;
			this.wedo[uuid].characteristics = characteristics;
			this.handshake(uuid, callback);
		}
	}.bind(this));
};

WeDo2.prototype.connectPeripheral = function (uuid, callback) {
	this.discovered = true;
	this.uuid = this.wedo[uuid].peripheral.uuid;
	this.name = this.wedo[uuid].peripheral.advertisement.localName;
	this.wedo[uuid].peripheral.connect(
		function (uuid) {
			this.setup(uuid, callback)
		}.bind(this, uuid));
	this.wedo[uuid].peripheral.on('disconnect', function (uuid) {
		console.log("disconnect");
		this.onDisconnect(uuid);
	}.bind(this, uuid));
};

WeDo2.prototype.onDisconnect = function (uuid) {

	if (this.wedo[uuid]) {
		this.wedo[uuid].peripheral.disconnect();
		this.wedo[uuid].peripheral = {};
		this.cout('Disconnected from WeDo: ' + this.wedo[uuid].name);
		delete this.wedo[uuid];
		this.emit('disconnected', uuid);
	}
};

/**
 * Performs necessary handshake to initiate communication with the device. Also configures all notification handlers.
 *
 *
 * @param callback to be called once set up
 * @private
 */
WeDo2.prototype.handshake = function (uuid, callback) {
	this.cout('WeDo2 initialisation');

	var listOfNotificationCharacteristics =
		[this.battery, this.button,
			this.portType, this.lowVoltageAlert,
			this.highCurrentAlert, this.lowSignalAlert,
			this.sensorValue, this.valueformat];
	listOfNotificationCharacteristics.forEach(function (key) {
		var characteristic = this.getCharacteristic(uuid, key);
		characteristic.notify(true);
	}.bind(this));

	// set LED lights to rgb values
	this.writePortDefinition(uuid, 0x06, 0x17, 0x01, 0x02, function () {
		console.log("have set RGB for LED");
	}.bind(this));

	this.getCharacteristic(uuid, this.portType).on('data', function (uuid, data, isNotification) {

		if (!isNotification) {
			return;
		}
		if (data[0] === 1 || data[0] === 2) {
			var thisPort = this.wedo[uuid].port[data[0] - 1];
			thisPort.connected = data[1];

			if (data[1]) {
				if (data[3] === 34) {
					thisPort.type = "tiltSensor";
					this.writePortDefinition(uuid, data[0], data[3], 0x00, 0x01, function () {
						console.log("activated tilt sensor on port " + data[0] + " @ " + uuid);
					});
				} else if (data[3] === 35) {
					thisPort.type = "distanceSensor";
					this.writePortDefinition(uuid, data[0], data[3], 0x02, 0x00, function () {
						console.log("activated distanceSensor on port " + data[0] + " @ " + uuid);
					});
				} else if (data[3] === 1) {
					thisPort.type = "motor";
					this.writePortDefinition(uuid, data[0], data[3], 0x02, 0x00, function () {
						console.log("activated motor on port " + data[0] + " @ " + uuid);
					});
				}

				this.emit('port', data[0], true, thisPort.type, uuid);
			} else {

				if (thisPort.type !== "none") {
					console.log("deactivated " + thisPort.type + " on port " + data[0] + " @ " + uuid);
					this.emit('port', data[0], false, thisPort.type, uuid);
				}

				thisPort.type = "none";
			}
		}

	}.bind(this, uuid));

	this.getCharacteristic(uuid, this.sensorValue).on('data', function (uuid, data, isNotification) {
		if (!isNotification) {
			return;
		}
		if (data[1] === 1 || data[1] === 2) {
			if (this.wedo[uuid].port[data[1] - 1].type === "tiltSensor") {
				this.wedo[uuid].sensorReadingX = data[2];
				if (this.wedo[uuid].sensorReadingX > 100) {
					this.wedo[uuid].sensorReadingX = -(255 - this.wedo[uuid].sensorReadingX);
				}
				this.wedo[uuid].sensorReadingY = data[3];
				if (this.wedo[uuid].sensorReadingY > 100) {
					this.wedo[uuid].sensorReadingY = -(255 - this.wedo[uuid].sensorReadingY);
				}

				this.emit('tiltSensor', parseInt(this.wedo[uuid].sensorReadingX * 2.55), parseInt(this.wedo[uuid].sensorReadingY * 2.55), data[1], uuid);
			} else if (this.wedo[uuid].port[data[1] - 1].type === "distanceSensor") {

				this.wedo[uuid].distanceValue = data[2];

				if (data[3] === 1) {
					this.wedo[uuid].distanceValue = data[2] + 255;
				}
				this.emit('distanceSensor', this.wedo[uuid].distanceValue, data[1], uuid);
			}
		}

	}.bind(this, uuid));

	this.getCharacteristic(uuid, this.valueformat).on('data', function (uuid, data, isNotification) {
		if (!isNotification) {
			return;
		}
		console.log("valueformat");
	}.bind(this, uuid));

	// todo check which one is the battery
	// Register listener for battery notifications.
	this.getCharacteristic(uuid, this.battery).on('data', function (uuid, data, isNotification) {
		if (!isNotification) {
			return;
		}
		this.emit('battery', data[data.length - 1], uuid);

	}.bind(this, uuid));

	this.getCharacteristic(uuid, this.button).on('data', function (uuid, data, isNotification) {
		if (!isNotification) {
			return;
		}

		this.emit('button', data[data.length - 1], uuid);

	}.bind(this, uuid));

	this.pingMotor(uuid);

	callback(uuid);
};

/**
 * Gets a Characteristic by it's unique_uuid_segment
 *
 * @param {String} unique_uuid_segment
 * @returns Characteristic
 */
WeDo2.prototype.writePortDefinition = function (uuid, port, type, mode, format, callback) {
	this.writeTo(uuid, "1563", Buffer([0x01, 0x02, port, type, mode, 0x01, 0x00, 0x00, 0x00, format, 0x01]), function () {
		callback();
	});
};

WeDo2.prototype.getCharacteristic = function (uuid, unique_uuid_segment) {
	if (!uuid) return null;
	if (!this.wedo[uuid]) return null;
	if (!this.wedo[uuid].characteristics) return null;
	var filtered = this.wedo[uuid].characteristics.filter(function (c) {
		return c.uuid.search(new RegExp(unique_uuid_segment)) !== -1;
	});

	if (!filtered[0]) {
		filtered = this.wedo[uuid].characteristics.filter(function (c) {
			return c._serviceUuid.search(new RegExp(unique_uuid_segment)) !== -1;
		});
	}
	if (filtered[0])
		return filtered[0];
	else return null;

};

/**
 * Writes a Buffer to a Characteristic by it's unique_uuid_segment
 *
 * @param {String} unique_uuid_segment
 * @param {Buffer} buffer
 */
WeDo2.prototype.writeTo = function (uuid, unique_uuid_segment, buffer, callback) {
	if (!this.wedo[uuid].characteristics) {
		var e = new Error('You must have bluetooth enabled and be connected to the WeDo before executing a command. Please ensure Bluetooth is enabled on your machine and you are connected.');
		if (callback) {
			callback(e);
		} else {
			throw e;
		}
	} else {
		if (typeof callback === 'function') {
			this.getCharacteristic(uuid, unique_uuid_segment).write(buffer, true, callback);
		} else {
			this.getCharacteristic(uuid, unique_uuid_segment).write(buffer, true);
		}
	}
};

/**
 * 'Disconnects' from the WeDo
 *
 * @param callback to be called once disconnected
 */
WeDo2.prototype.disconnect = function () {
	this.cout('WeDo 2.0 controller is disconnected');

	for (var uuid in this.wedo) {
		this.onDisconnect(uuid);
	}
};

/**
 * Obtains the signal strength of the connected WeDo as a dBm metric.
 *
 * @param callback to be called once the signal strength has been identified
 */
WeDo2.prototype.getSignalStrength = function (callback, uuid) {
	uuid = this.getUuidFromInput(uuid);
	if (uuid != null && this.wedo[uuid]) {
		this.wedo[uuid].peripheral.updateRssi(callback);
	}
	;
};

WeDo2.prototype.getDeviceName = function (callback, uuid) {

	uuid = this.getUuidFromInput(uuid);
	if (uuid != null && this.wedo[uuid]) {
		this.getCharacteristic(uuid, this.nameID).read(function (e, b) {
			this(b.toString(), uuid);
		}.bind(callback), uuid);
	} else {
		console.log("not found");
	}
};

WeDo2.prototype.setDeviceName = function (name, uuid) {
	uuid = this.getUuidFromInput(uuid);
	if (uuid != null && this.wedo[uuid]) {
		this.writeTo(uuid, this.nameID, Buffer(name), function () {
		});
	}
};

WeDo2.prototype.setLedColor = function (R, G, B, uuid) {
	uuid = this.getUuidFromInput(uuid);
	if (uuid != null && this.wedo[uuid]) {
		this.writeTo(uuid, "1565", Buffer([0x06, 0x04, 0x03, R, G, B]), function () {

		});
	}
};

WeDo2.prototype.setSound = function (frequency, length, uuid) {
	uuid = this.getUuidFromInput(uuid);
	if (uuid != null && this.wedo[uuid]) {
		this.writeTo(uuid, "1565", Buffer([0x05, 0x02, 0x04,
			this.longToByteArray(frequency)[0], this.longToByteArray(frequency)[1],
			this.longToByteArray(length)[0], this.longToByteArray(length)[1]]), function () {
		});
	}
};


WeDo2.prototype.longToByteArray = function(integer) {
	// we want to represent the input as a 8-bytes array
	var byteArray = [0, 0];

	for ( var index = 0; index < byteArray.length; index ++ ) {
		var byte = integer & 0xff;
		byteArray [ index ] = byte;
		integer = (integer - byte) / 256 ;
	}
	return byteArray;
};

WeDo2.prototype.setMotor = function (speed, port, uuid) {
	uuid = this.getUuidFromInput(uuid);
	if (uuid != null && this.wedo[uuid]) {
		if (typeof port === "undefined") {
			port = null;
		}
		this.wedo[uuid].runMotor = null;

		if (port !== null) {
			if (port === 1 && port === 2)
				if (this.wedo[uuid].port[port - 1].type === "motor") {
					this.wedo[uuid].runMotor = port;
				}
		} else {

			if (this.wedo[uuid].port[0].type === "motor") {

				this.wedo[uuid].runMotor = 0x01;
			} else if (this.wedo[uuid].port[1].type === "motor") {
				this.wedo[uuid].runMotor = 0x02;
			}
		}

		if (this.wedo[uuid].runMotor !== null) {
			console.log("moter: " + speed);

			if (speed > 1 && speed <= 100) {
				this.wedo[uuid].motorResult = this.map(speed, 1, 100, 35, 100);
			} else if (speed < -1 && speed >= -100) {
				this.wedo[uuid].motorResult = this.map(speed, -1, -100, 220, 155);
			} else {
				this.wedo[uuid].motorResult = 127;
			}
		}
	}
};

WeDo2.prototype.pingMotor = function (uuid) {
	var self = this;

	setInterval(function (uuid) {
		if (this.wedo[uuid]) {
			if (this.wedo[uuid].runMotor !== null) {
				if (this.wedo[uuid] && this.wedo[uuid].characteristics) {
					this.getCharacteristic(uuid, "1565").write(Buffer([this.wedo[uuid].runMotor, 0x01, 0x02, parseInt(this.wedo[uuid].motorResult)], true));
				}
			}
		}
	}.bind(this,uuid), 100);
};

WeDo2.prototype.map = function (x, in_min, in_max, out_min, out_max) {
	if (x > in_max) x = in_max;
	if (x < in_min) x = in_min;
	return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
};

WeDo2.prototype.cout = function (text) {
	console.log(text);
};

WeDo2.prototype.getUuidFromInput = function (input) {
	if (typeof input === "string") {
		if (input in this.wedo) {
			return input;
		} else {
			for (var uuid in this.wedo) {
				if (this.wedo[uuid].name === input) {
					return uuid;
				}
			}
		}
		return null;
	} else if (typeof input === "number") {
		var index = 0;
		for (var uuid in this.wedo) {
			if (index === input) {
				return uuid;
			}
			index++;
		}
		return null;
	} else {
		for (var uuid in this.wedo) {
			return uuid;
		}
		return null;
	}
};

module.exports = new WeDo2();