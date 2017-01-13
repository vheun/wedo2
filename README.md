# wedo 2.0

This is a node.js module for the Lego WeDo 2.0 set.

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
(Optional) The uuid attribute provides the uuid of the actual connected WeDo
Every discovered WeDo calls .connect individually.

~~~~
wedo.connect(function (uuid) {
	// Once you reach this place in your code,
	// the WeDo is connected and ready to go.
}
~~~~

####Events

Once the setup is finalized, the following events are provided:

Battery status in %. (Optional) uuid tells on which WeDo the status was emitted.
~~~~
wedo.on('battery', function (status, uuid) {
    console.log('Battery: ' + status + '% @ '+uuid);
});
~~~~

If a distance sensor is connected, it will send its 
distance in the range of 0 and 512 as well the port.  (Optional) uuid tells on which WeDo the status was emitted.
~~~~
wedo.on('distanceSensor', function (distance, port, uuid) {
	console.log("distanceSensor: "+distance+" at port "+port + " @ "+uuid);
});
~~~~

If a tilt sensor is connected, it will send its 
tilt x and y in the range of -100 and 100 as well the port.  (Optional) uuid tells on which WeDo the status was emitted.

~~~~
wedo.on('tiltSensor', function (x,y, port, uuid ) {
    console.log("tilt sensor: "+x+"   "+y+" at port "+port +" @ "+uuid);
});
~~~~

If the WeDo button on the controller is clicked the following event is fired.  (Optional) uuid tells on which WeDo the status was emitted.
~~~~
wedo.on('button', function (button, uuid) {
	console.log("button state: "+button + " @ "+ uuid );
});
~~~~

####Setters

Without any extra attribute, all setters will set values for the first WeDo found.
If more then one WeDo is found, you can chose either of these methods as "device" additional attribute:

<b>uuid</b>: You can hand over the exact uuid of an object.<br>
<b>name</b>: You can hand over the exact name of your object. If two objects have the same name, the first match will count.<br>
<b>number</b>: You can separate the WeDo calls by providing just a number value (0,1,2,...).

Set the name of your WeDo. If you use more then one device, this a good place to define names to differentiate specific WeDo's.
~~~~
wedo.setDeviceName(yourName, (optional) device);
~~~~

Set the Led color of the WeDo controller to an RGB value.
Each value is in the scale from 0-255.
For example Red, Green Blue all set to 255 is white:
~~~~
wedo.setLedColor(r,g,b, (optional) device); 
~~~~

Set the motor speed, if a motor is connected.<br>
(Optional) If you want to operate a motor on a specific port,
you can add the port number (1 or 2) after the speed.
Set the port to ```null``` to leave it blank in case you want to set device.
~~~~
wedo.setMotor(speed, (optionl) port, (optional) device);
~~~~


####Getters	
		
If you work with more then one WeDo, you have the same device choices as with the setters.		
		
To get the name of your WeDo

~~~~		
wedo.getDeviceName(function(name, uuid){
    console.log("the device name is "+name+" @ "+uuid);
}, device);
~~~~

Get the Signal strength of the WeDo Bluetooth LE.

~~~~
wedo.getSignalStrength(function (err, signal, uuid) {
	console.log('Signal: ' + signal + 'dBm'+ " @ "+uuid);
}, device);
~~~~