# wedo 2.0

This is a library for the Lego WeDo 2.0 set.

TODO: This library will be extended to support multiple WeDo's

Install

~~~~
npm install wedo2
~~~~
    

####How to initialize a Wedo block
~~~~
var Wedo2 = require('wedo2');
var wedo = new Wedo2();
~~~~

Before you can talk to the WeDo, you need to open a connection.
The Callback of this connection has to be the setup of the WeDo.

~~~~
wedo.connect(function () {
	wedo.setup(function () {
	// Once you reach this place in your code,
	// the WeDo is connected and ready to go.
	}
}
~~~~

####Events

Once the setup is finalized, the following events are provided:

Battery status in %
~~~~
wedo.on('battery', function (status) {
    console.log('Battery: ' + status + '%');
});
~~~~

If a distance sensor is connected, it will send its 
distance in the range of 0 and 512 as well the port
~~~~
wedo.on('distanceSensor', function (distance, port) {
	console.log("distanceSensor: "+distance+" at port "+port);
});
~~~~

If a tilt sensor is connected, it will send its 
tilt x and y in the range of -100 and 100 as well the port

~~~~
wedo.on('tiltSensor', function (x,y, port) {
    console.log("tilt sensor: "+x+"   "+y+" at port "+port);
});
~~~~

If the WeDo button on the controller is clicked the following event is fired.
~~~~
wedo.on('button', function (button) {
	console.log("button state: "+button);
});
~~~~

####Setters

Set the name of your WeDo
~~~~
wedo.setDeviceName(yourName);
~~~~

Set the Led color of the WeDo controller to an RGB value.
Each value is in the scale from 0-255.
For example Red, Green Blue all set to 255 is white:
~~~~
wedo.setLedColor(r,g,b); 
~~~~

Set the motor speed, if a motor is connected.
~~~~
wedo.setMotor(speed);
~~~~
(Optional) If you want to operate a motor on a specific port,
you can add the port number (1 or 2) after the speed.
~~~~
wedo.setMotor(speed, port);
~~~~

####Getters	
		
To get the name of your WeDo

~~~~		
wedo.getDeviceName(function(name){
    console.log("the device name is "+name);
});
~~~~

Get the Signal strength of the WeDo Bluetooth LE.

~~~~
wedo.getSignalStrength(function (err, signal) {
	console.log('Signal: ' + signal + 'dBm');
});
~~~~