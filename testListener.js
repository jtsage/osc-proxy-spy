/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) 2024 JTSage <https://github.com/jtsage/osc-proxy-spy> */
/* eslint-disable no-console */

const oscDeviceAddress   = '0.0.0.0'
const oscDevicePort      = parseInt(process.argv.slice(2, 3)) ?? 3333

const osc   = require('simple-osc-lib')
const dgram = require('node:dgram')

const oscSocket = dgram.createSocket({type : 'udp4', reuseAddr : true})
const oscLib    = new osc.simpleOscLib()

oscSocket.on('message', (msg, rinfo) => {
	console.log(`Packet of ${rinfo.size} bytes received`)
	console.log(`Packet from ${rinfo.family === 'IPv4' ? 'udp4' : 'udp6'}://${rinfo.address}:${rinfo.port}`)
	try {
		console.dir(oscLib.readPacket(msg), { depth : 4 })
	} catch (err) {
		console.log(`Invalid packet received : ${err}`)
	}
})
oscSocket.on('error', (err) => {
	console.log(`listener error:\n${err.stack}`)
	oscSocket.close()
})
oscSocket.on('listening', () => {
	const address = oscSocket.address()
	console.log(`listening to osc on ${address.address}:${address.port}`)
})
oscSocket.bind(oscDevicePort, oscDeviceAddress)
