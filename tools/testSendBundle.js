/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) 2024 JTSage <https://github.com/jtsage/osc-proxy-spy> */

const oscDeviceAddress   = '127.0.0.1'
const oscDevicePort      = parseInt(process.argv.slice(2, 3)) ?? 3333
const heartBeatFrequency = 1000 // in ms

const osc   = require('simple-osc-lib')
const dgram = require('node:dgram')

const oscSocket = dgram.createSocket({type : 'udp4', reuseAddr : true})
const oscLib    = new osc.simpleOscLib()

const heartBeatMessage = {
	address : '/hello',
	args    : [
		{ type : 'string', value : 'world' },
		// { type : 'integer', value : 2147483647},
		// { type : 'bigint', value : BigInt("0x1fffffffffffff") },
		// { type : 'float', value : 69.6969 },
		// { type : 'double', value : 69.69 },
		// { type : 'blob', value : Buffer.alloc(2) },
		// { type : 'true', value : null },
		// { type : 'false', value : null },
		// { type : 'bang', value : null },
		// { type : 'null', value : null },
		// { type : 'char', value : 'A' },
		// { type : 'timetag', value : new Date() },
		{ type : 'color', value : [204, 102, 51, 255]},
	],
}

function getRandomInt(max) {
	return Math.floor(Math.random() * max)
}


setInterval(() => {
	heartBeatMessage.args[heartBeatMessage.args.length - 1].value = [getRandomInt(255), getRandomInt(255), getRandomInt(255), 255]
	const message2 = oscLib.messageBuilder('/movingNumber').float(Math.random()).toBuffer()
	const heartBeatBuffer = oscLib.buildMessage(heartBeatMessage)
	const bundle = oscLib.buildBundle({
		timetag : oscLib.getTimeTagBufferFromDelta((50-getRandomInt(100))/1000),
		elements : [message2, heartBeatBuffer],
	})
	oscSocket.send(bundle, 0, bundle.length, oscDevicePort, oscDeviceAddress)
}, heartBeatFrequency)

