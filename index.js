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
 * Thanks to https://lego.github.io for documenting the LEGO Wireless Protocol
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

var noble = require('@abandonware/noble');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var framerate = 5;

/**
 * Constructors for Objects
 */

function Device() {
	this.name = "";
	this.uuid = "";
	this.isConnected = false;
	this.port = {};
	this.deviceType = "";
}

function Port() {
	this.byte = null;
	this.connected = 0;
	this.type = "none";
	this.runMotor = null;
	this.motorResult = 127;
}

/**
 * Constructs a new WeDo 2.0
 * @constructor
 */

var WeDo2 = function (nameSpace) {

	this.battery = "180f";
	this.button = "1526";
	this.portType = "1527";
	this.lowVoltageAlert = "1528";
	this.highCurrentAlert = "1529";
	this.lowSignalAlert = "152a";
	this.sensorValue = "1560";
	this.valueformat = "1561";
	this.nameID = "1524";
	this.boostHub = "1624"

	this.wedo = {};

	this.ble = noble;

	this.connect(nameSpace);

	// handle disconnect gracefully
	this.ble.on('warning', function (message) {
		this.onDisconnect();
	}.bind(this));

	process.on('exit', function (e) {
		this.disconnect();
		console.log(e);
		process.exit();
	}.bind(this));

	process.on('uncaughtException', function (e) {
		this.disconnect();
		console.log("uncaughtException");
		console.log(e);
		process.exit();
	}.bind(this));

	process.on('SIGINT', function (e) {
		this.disconnect();
		console.log(e);
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
WeDo2.prototype.connect = function (nameSpace, callback) {

	this.cout('WeDo 2.0 Connect');

	this.ble.on('discover', function (nameSpace, peripheral) {
		
		let device = this.isWeDoPeripheral(nameSpace, peripheral);
		if (device) {
			if (!this.wedo[peripheral.uuid]) {
				this.wedo[peripheral.uuid] = new Device();
				this.wedo[peripheral.uuid].deviceType = device;
				this.wedo[peripheral.uuid].name = peripheral.advertisement.localName;
				this.wedo[peripheral.uuid].uuid = peripheral.uuid;
				this.wedo[peripheral.uuid].peripheral = peripheral;

				if(device === "boost")
				this.cout('Found the following Lego Move Hub: ' + peripheral.advertisement.localName + ' with UUID ' + peripheral.uuid);

				if(device === "wedo2")
					this.cout('Found the following Lego Wedo 2.0: ' + peripheral.advertisement.localName + ' with UUID ' + peripheral.uuid);

				this.connectPeripheral(peripheral.uuid, function (uuid){
					console.log("emit", "connectPeripheral");
					this.emit('connected', uuid);

				}.bind(this,peripheral.uuid));
			}
		}
	}.bind(this, nameSpace));

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
WeDo2.prototype.isWeDoPeripheral = function (nameSpace, peripheral) {
	if (!peripheral) {
		return false;
	}
	let deviceType = null;
	var localName = peripheral.advertisement.localName;
	var manufacturer = peripheral.advertisement.serviceUuids;

	var weDoServiceID =  "000015231212efde1523785feabcd123";
	var boostServiceID = "000016231212efde1623785feabcd123";
	var weDoName = "LPF2 Hub I/O";

	var localNameMatch = localName && localName.indexOf(weDoName) === 0;
	var manufacturerMatchWedo = manufacturer && manufacturer.indexOf(weDoServiceID) === 0;
	var manufacturerMatchBoost = manufacturer && manufacturer.indexOf(boostServiceID) === 0;

	// look for a specific string in the name
	if(nameSpace){
		manufacturerMatchWedo = false;
		manufacturerMatchBoost = false;
		localNameMatch = localName && localName.indexOf(nameSpace) !== -1;
	}

	if(manufacturerMatchWedo) {
		deviceType = "wedo2"
	} else if (manufacturerMatchBoost) {
		deviceType = "boost"
	}

	if(localNameMatch || deviceType){
		return deviceType;
	}  else {
		return null;
	}
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
			this.handshake(uuid, callback, this.wedo[uuid].deviceType);
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
		console.log("emit", "onDisconnect");
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
WeDo2.prototype.handshake = function (uuid, callback, deviceType) {
	this.cout('WeDo2 initialisation');

	var listOfNotificationCharacteristics = [];

	if(deviceType === "wedo2") {
		listOfNotificationCharacteristics = [this.battery, this.button,
			this.portType, this.lowVoltageAlert,
			this.highCurrentAlert, this.lowSignalAlert,
			this.sensorValue, this.valueformat, this.boostHub];
	} else if(deviceType === "boost"){
		listOfNotificationCharacteristics = [this.boostHub];
	}

	listOfNotificationCharacteristics.forEach(function (key) {
		var characteristic = this.getCharacteristic(uuid, key);
		if(characteristic) {
			characteristic.notify(true);
		}


	}.bind(this));


	let thisDeviceType = this.wedo[uuid].deviceType;
if(thisDeviceType === "wedo2") {
	// set LED lights to rgb values
	this.writePortDefinition(uuid, 0x06, 0x17, 0x01, 0x02, function () {
		console.log("have set RGB for LED");
	}.bind(this));
	} else if(thisDeviceType === "boost") {
		// set LED lights to rgb values
	/*this.writePortDefinitionToBoost(uuid, 0x08,  0x01,framerate, function () {
			console.log("have set RGB for LED");
		}.bind(this));*/
	};


	if(thisDeviceType === "boost") {
		this.getCharacteristic(uuid, this.boostHub).on('data', function (uuid, data, isNotification) {


			let messageType = data[2];
			let portID = data[3];
			let isPortConnected = data[4];
			let connectedDevice = data[5];

			if(!this.wedo[uuid].port.hasOwnProperty(""+portID)) {
				this.wedo[uuid].port["" + portID] = new Port();
			}
			this.wedo[uuid].port[portID].byte = portID;
			let thisPort = this.wedo[uuid].port[""+portID];

			/*if (connectedDevice === 0x25) {
				console.log(data);}*/

			//check for Ports signal
			if (messageType === 0x04) {
					thisPort.connected = isPortConnected;
				if (isPortConnected) {

					if (connectedDevice === 0x22 || connectedDevice === 0x28) {
						thisPort.type = "tiltSensor";
						this.writePortDefinitionToBoost(uuid, thisPort.byte, 0x00, framerate, function () {
							console.log("activated tilt sensor on port " + thisPort.byte + " @ " + uuid);
						});
					} else if (connectedDevice === 0x23) {
						thisPort.type = "distanceSensor";
						this.writePortDefinitionToBoost(uuid, thisPort.byte, 0x00, framerate, function () {
							console.log("activated distanceSensor on port " + thisPort.byte + " @ " + uuid);
						});
					} else if (connectedDevice === 0x25) {
						thisPort.type = "visionSensor";
						this.writePortDefinitionToBoost(uuid, thisPort.byte, 0x00, framerate, function () {
							console.log("activated vision sensor on port " + thisPort.byte + " @ " + uuid);
						});
					} else if (connectedDevice === 0x01) {
						thisPort.type = "motor";
					this.writePortDefinitionToBoost(uuid,thisPort.byte, 0x00, framerate, function () {
							console.log("activated motor on port " + thisPort.byte + " @ " + uuid);
						});
					}
					else if (connectedDevice === 0x17) {
						thisPort.type = "LEDLight";
						this.writePortDefinitionToBoost(uuid,thisPort.byte, 0x00, framerate, function () {
							console.log("activated LED Light on port " + thisPort.byte + " @ " + uuid);
						});
					}
					else if (connectedDevice === 0x05) {
						thisPort.type = "Button";
						this.writePortDefinitionToBoost(uuid,thisPort.byte, 0x00, framerate, function () {
							console.log("activated Button on port " + thisPort.byte + " @ " + uuid);
						});
					}
					else if (connectedDevice === 0x26 || connectedDevice === 0x27) {
						thisPort.type = "motor";
						this.writePortDefinitionToBoost(uuid, thisPort.byte, 0x00,framerate, function () {
							console.log("activated tacho Motor on port " + thisPort.byte + " @ " + uuid);
						});
					}

console.log("emit", "boost port");

					if (thisPort.type !== "none") {
						this.emit('port', thisPort.byte, true, thisPort.type, uuid);
					}
				}  else {

					if (thisPort.type !== "none") {
						console.log("deactivated " + thisPort.type + " on port " + data[3] + " @ " + uuid);
						console.log("emit", "boost port");
						this.emit('port', thisPort.byte, false, thisPort.type, uuid);
					}

					thisPort.type = "none";
				}
			}


			if (messageType === 0x45) {

				if (connectedDevice === 0x25) {
					if (this.wedo[uuid].port[thisPort.byte].type === "tiltSensor") {
						this.wedo[uuid].sensorReadingX = data[4];
						if (this.wedo[uuid].sensorReadingX > 100) {
							this.wedo[uuid].sensorReadingX = -(255 - this.wedo[uuid].sensorReadingX);
						}
						this.wedo[uuid].sensorReadingY = data[5];
						if (this.wedo[uuid].sensorReadingY > 100) {
							this.wedo[uuid].sensorReadingY = -(255 - this.wedo[uuid].sensorReadingY);
						}
						console.log("emit", "wedo port 1");
						this.emit('tiltSensor', this.wedo[uuid].sensorReadingX, this.wedo[uuid].sensorReadingY, thisPort.byte, uuid);
					} else if (this.wedo[uuid].port[thisPort.byte].type === "distanceSensor") {

						this.wedo[uuid].distanceValue = data[4];

						if (data[5] === 1) {
							this.wedo[uuid].distanceValue = data[4] + 255;
						}
						console.log("emit", "wedo port 2");
						this.emit('distanceSensor', this.wedo[uuid].distanceValue, thisPort.byte, uuid);
					} else if (this.wedo[uuid].port[thisPort.byte].type === "visionSensor") {

						console.log(data);
					}
				}
			}



		}.bind(this, uuid));



/*
todo: add vision sensor to readings
todo: add motor emit to readings

*/

	} else if(thisDeviceType === "wedo2") {


                this.getCharacteristic(uuid, this.portType).on('data', function (uuid, data, isNotification) {

					let portID = data[0];
					let isPortConnected = data[1];
					let connectedDevice = data[3];


					if(!this.wedo[uuid].port.hasOwnProperty(""+portID)) {
						this.wedo[uuid].port["" + portID] = new Port();
					}
					this.wedo[uuid].port[portID].byte = portID;
					let thisPort = this.wedo[uuid].port[""+portID];

					//console.log(uuid, arguments);
                    //if (!isNotification) {return;}
                    if (portID) {
                        thisPort.connected = isPortConnected;

                        if (isPortConnected) {
                            if (connectedDevice === 34) {
                                thisPort.type = "tiltSensor";
                                this.writePortDefinition(uuid, thisPort.byte, connectedDevice, 0x00, 0x00, function () {
                                    console.log("activated tilt sensor on port " + thisPort.byte + " @ " + uuid);
                                });
                            } else if (connectedDevice === 35) {
                                thisPort.type = "distanceSensor";
                                this.writePortDefinition(uuid, thisPort.byte, connectedDevice, 0x00, 0x00, function () {
                                    console.log("activated distanceSensor on port " + thisPort.byte + " @ " + uuid);
                                });
                            } else if (connectedDevice=== 1) {
                                thisPort.type = "motor";
                                this.writePortDefinition(uuid, thisPort.byte, connectedDevice, 0x02, 0x00, function () {
                                    console.log("activated motor on port " + thisPort.byte + " @ " + uuid);
                                });
                            }
							console.log("emit", "wedo port 3");
                            this.emit('port',thisPort.byte, true, thisPort.type, uuid);
                        } else {

                            if (thisPort.type !== "none") {
                                console.log("deactivated " + thisPort.type + " on port " + thisPort.byte+ " @ " + uuid);
								console.log("emit", "wedo port4 ");
                                this.emit('port', thisPort.byte, false, thisPort.type, uuid);
                            }

                            thisPort.type = "none";
                        }
                    }

                }.bind(this, uuid));



                this.getCharacteristic(uuid, this.sensorValue).on('data', function (uuid, data, isNotification) {

					let portID = data[1];

					if(!this.wedo[uuid].port.hasOwnProperty(""+portID)) {
						this.wedo[uuid].port["" + portID] = new Port();
					}
					this.wedo[uuid].port[portID].byte = portID;
					let thisPort = this.wedo[uuid].port[""+portID];


					//if (!isNotification) {return;}
                    if (portID) {
                        if (this.wedo[uuid].port["" + portID].type === "tiltSensor") {
                            this.wedo[uuid].sensorReadingX = data[2];
                            if (this.wedo[uuid].sensorReadingX > 100) {
                                this.wedo[uuid].sensorReadingX = -(255 - this.wedo[uuid].sensorReadingX);
                            }
                            this.wedo[uuid].sensorReadingY = data[3];
                            if (this.wedo[uuid].sensorReadingY > 100) {
                                this.wedo[uuid].sensorReadingY = -(255 - this.wedo[uuid].sensorReadingY);
                            }
							console.log("emit", "wedo port5");
                            this.emit('tiltSensor', this.wedo[uuid].sensorReadingX, this.wedo[uuid].sensorReadingY, thisPort.byte, uuid);
                        } else if (this.wedo[uuid].port["" + portID].type === "distanceSensor") {

                            this.wedo[uuid].distanceValue = data[2];

                            if (data[3] === 1) {
                                this.wedo[uuid].distanceValue = data[2] + 255;
                            }
							console.log("emit", "wedo prot6");
                            this.emit('distanceSensor', this.wedo[uuid].distanceValue, thisPort.byte, uuid);
                        }
                    }

                }.bind(this, uuid));

                this.getCharacteristic(uuid, this.valueformat).on('data', function (uuid, data, isNotification) {
                    //if (!isNotification) {return;}
                    console.log("valueformat");
                }.bind(this, uuid));

                // todo check which one is the battery
                // Register listener for battery notifications.
                this.getCharacteristic(uuid, this.battery).on('data', function (uuid, data, isNotification) {
                    //if (!isNotification) {return;}
					console.log("emit","batery");
                    this.emit('battery', data[data.length - 1], uuid);

                }.bind(this, uuid));

                this.getCharacteristic(uuid, this.button).on('data', function (uuid, data, isNotification) {
                    //if (!isNotification) {return;}
					console.log("emit", "button");
                    this.emit('button', data[data.length - 1], uuid);

                }.bind(this, uuid));

                this.pingMotor(uuid);

                callback(uuid);
	}
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
WeDo2.prototype.writePortDefinitionToBoost = function (uuid, port, mode, thisFrameRate, callback ) {

	let frameRateArray = this.numberTo4ByteArray(thisFrameRate);
console.log(frameRateArray);
	this.writeTo(uuid, "1624", Buffer([0x0a, 0x00, 0x41, port, mode, frameRateArray[0], frameRateArray[1], frameRateArray[2], frameRateArray[3], 0x01]), function () {
		callback();
	});
};

WeDo2.prototype.getCharacteristic = function (uuid, unique_uuid_segment) {
	if (!uuid) return null;
	//console.log("--1");
	if (!this.wedo[uuid]) return null;
	//console.log("--2");
	if (!this.wedo[uuid].characteristics) return null;
	//console.log("--3");
	var filtered = this.wedo[uuid].characteristics.filter(function (c) {
		return c.uuid.search(new RegExp(unique_uuid_segment)) !== -1;
	});
	//console.log("--4");
	if (!filtered[0]) {
		filtered = this.wedo[uuid].characteristics.filter(function (c) {
			return c._serviceUuid.search(new RegExp(unique_uuid_segment)) !== -1;
		});
	}

	if (filtered[0])
		return filtered[0];
	else return null;

};

WeDo2.prototype.numberTo4ByteArray = function(number) {
	let bytes = new Array(4)
	for(var i = 0; i < bytes.length; i++) {
		var byte = number & 0xff;
		bytes[i] = byte;
		number = (number - byte) / 256 ;
	}
	return bytes;
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
			if (port === 1 || port === 2) {
				if (this.wedo[uuid].port[port - 1].type === "motor") {
					//this.wedo[uuid].runMotor = port;
					if (port === 1)    this.wedo[uuid].runMotor = 0x01;
					if (port === 2)    this.wedo[uuid].runMotor = 0x02;
				}
			}
		} else {

			if (this.wedo[uuid].port[0].type === "motor") {

				this.wedo[uuid].runMotor = 0x01;
			} else if (this.wedo[uuid].port[1].type === "motor") {
				this.wedo[uuid].runMotor = 0x02;
			}
		}

		if (this.wedo[uuid].runMotor !== null) {


			if (speed > 1 && speed <= 100) {
				this.wedo[uuid].motorResult = parseInt(this.map(speed, 1, 100, 15, 97));
			} else if (speed < -1 && speed >= -100) {
				this.wedo[uuid].motorResult = parseInt(this.map(speed, -100, -1, 160,245));
			} else {
				this.wedo[uuid].motorResult = 0;
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
					this.wedo[uuid].newMotor = this.wedo[uuid].motorResult;

					if(this.wedo[uuid].newMotor  !== this.wedo[uuid].oldMotor){

					this.getCharacteristic(uuid, "1565").write(Buffer([this.wedo[uuid].runMotor, 0x01, 0x02, parseInt(this.wedo[uuid].motorResult)], true));
						this.wedo[uuid].oldMotor = this.wedo[uuid].newMotor;
						}
				}
			}
		}
	}.bind(this,uuid), 120);
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

module.exports = WeDo2;
