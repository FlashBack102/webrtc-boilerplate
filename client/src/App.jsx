import React, { useEffect, useRef, useState } from 'react';
import { io } from "socket.io-client"

const App = () => {
    const peerListRef = useRef({}) // socket connection list
	const dataChannelRef = useRef({}) // data channel list
	const mediaRef = useRef({}) // media stream
	const [userSocket, setUserSocket] = useState(false)
	const [peerList, setPeerList] = useState({})
	const [messageText, setMessageText] = useState("")

	useEffect(() => {
		const myPeerId = 'peer-' + crypto.randomUUID()
		console.log('My PeerId: ', myPeerId)
		let socket = io('http://localhost:3000', {
			query: {
				peerId: myPeerId
			},
			transports: ['websocket']
		}) // Connect socket.io
		console.log('Connect socket')
		setUserSocket(socket)

		return () => {
			console.log('Socket disconnected!!')
			peerListRef.current = {}
			dataChannelRef.current = {}
			mediaRef.current = {}
			setPeerList({})
            socket.disconnect()
            socket.removeAllListeners()
        }
	}, [])

	useEffect(() => {
		if(userSocket !== false) {
			const peerConnectionConfig = { 
				'iceServers': [
					{ urls: [ "stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19305" ] },
				]
			}; // RTC peer conneciton info

			userSocket.on('peer-connected', (data) => { // other peer connected
				const peerId = data.peerId // connected peer id
				const connectedPeerList = data.peerList // connected peer list

				console.log('Connected peerId: ', peerId)
				console.log('peerList: ', connectedPeerList)

				connectedPeerList.forEach((peer) => {
					if(typeof peerListRef.current[peer] === 'undefined') {
						if(peer !== peerId) { // Except my peer
							console.log('Start peer connection!')
							const peerConnection = new RTCPeerConnection(peerConnectionConfig)
							peerListRef.current[peer] = peerConnection
							setPeerList((prev) => ({
								...prev,
								[peer]: peerConnection
							}))

							const dataChannel = peerConnection.createDataChannel('dataChannel') // Create data channel
							dataChannelRef.current[peer] = dataChannel
							console.log('Create DataChannel: ', dataChannel)

							dataChannel.onopen = () => { // Data channel open success
								console.log('dataChannel open!')
								dataChannel.send('hello')
							}
							dataChannel.onmessage =(event) => { // Received data channel message
								console.log('dataChannel onmessage: ', event)
							}
							dataChannel.onerror = (error) => {
								console.error('dataChannel error: ', error)
							}
							dataChannel.onclose = () => {
								console.log('dataChannel close')
							}

							peerConnection.onicecandidate = event => { // Get IceCandidate
								console.log('Start onicecandidate')
								if(event.candidate) {
									console.log('Candidate: ', event.candidate)
									userSocket.emit('ice-candidate', {
										toId: peer,
										fromId: peerId,
										candidate: event.candidate
									})
								}
							}

							const startSiganlingOffer = async () => {
								try {
									const offer = await peerConnection.createOffer()
									await peerConnection.setLocalDescription(offer)
									console.log('Signal offer')
									userSocket.emit('signal', {
										toId: peer, // Receiver peer id
										fromId: peerId, // Sender peer id (me)
										sdp: offer // SDP offer data
									})
								} catch (error) {
									console.error('startSignalingOffer error: ', error)
								} finally {}
							}

							navigator.mediaDevices.getUserMedia({
								video: true,
								audio: true
							})
							.then((stream) => {
								console.log('offer getUserMedia: ', stream)
								// mediaRef.current.srcObject = stream
								stream.getTracks().forEach((track) => {
									peerConnection.addTrack(track, stream)
								})

								startSiganlingOffer()
							})
							.catch((error) => {
								console.error('error: ', error)
								startSiganlingOffer()
							})
							.finally(() => {})

							peerConnection.oniceconnectionstatechange = () => {
								console.log(peerConnection.iceConnectionState, 'connected state')
							}

							console.log('user media device: ', mediaRef)

						} else {	
							console.log('current peer connection except')
						}
					}
				})

				console.log('peerListRef:', peerListRef.current)
			})

			/* Get signal data */
			userSocket.on('signal', (data) => {
				console.log('Signal Event On', data)

				let toId = data.toId // Receiver (me)
				let fromId = data.fromId // Sender
				let sdp = data.sdp // SDP offer data

				if(sdp.type === 'offer') {
					console.log('SDP type: offer')

					const peerConnection = new RTCPeerConnection(peerConnectionConfig)
					peerListRef.current[fromId] = peerConnection
					setPeerList((prev) => ({
						...prev,
						[fromId]: peerConnection
					}))

					peerConnection.ondatachannel = (event) => { // Get data channel
						const channel = event.channel
						dataChannelRef.current[fromId] = channel
						console.log('ondatachannel', fromId)
						console.log('channel: ', channel)

						channel.onopen = () => { // Data channel open success
							console.log('data channel open!')
						}
						channel.onmessage = (event) => { // Receive message data
							console.log('Receive data channel onmessage: ', event)
						}
					}
					
					navigator.mediaDevices.getUserMedia({
						video: true,
						audio: true
					})
					.then((stream) => {
						console.log('answer getUserMedia: ', stream)
						stream.getTracks().forEach((track) => {
							peerConnection.addTrack(track, stream)
						})
					})
					.catch((error) => {
						console.error('getUserMedia error: ', error)
					})
					.finally(() => {})

					peerConnection.setRemoteDescription(new RTCSessionDescription(sdp))
					.then(() => {
						peerConnection.createAnswer()
						.then((answer) => {
							peerConnection.setLocalDescription(answer)
							.then(() => {
								console.log('Signal answer')
								
								userSocket.emit('signal', {
									toId: data.fromId, // Sender peer id (me)
									fromId: data.toId, // Receiver peer id
									sdp: answer
								}) // Reverse toId, fromId
							})
							.catch((error) => {
								console.error('setLocaleDescription error: ', error)
							})
							.finally(() => {}) // End setLocaleDescription
						})
						.catch((error) => {
							console.error('createAnswer error: ', error)
						})
						.finally(() => {}) // End createAnswer
					})
					.catch((error) => {
						console.error('setRemoteDescription error: ', error)
					})
					.finally(() => {}) // End setRemoteDescription

					peerConnection.oniceconnectionstatechange = () => {
						console.log(peerConnection.iceConnectionState, 'connected state')
					}

					peerConnection.ontrack = (event) => {
						console.log('Offer ontrack: ', event)
						const [remoteStream] = event.streams
						const videoElement = mediaRef.current[fromId]

						if(videoElement) {
							videoElement.srcObject = remoteStream
						} else {
							console.warn(`video element not found for peer ${fromId}`)
						}
					}

				} else if(sdp.type === 'answer') {
					console.log('SDP type: answer')

					peerListRef.current[fromId].setRemoteDescription(new RTCSessionDescription(sdp))
					.then(() => {
						console.log('RTC Connection Success')

						peerListRef.current[fromId].ontrack = (event) => {
							console.log('Answer ontrack: ', event)
							const [remoteStream] = event.streams
							const videoElement = mediaRef.current[fromId]

							if(videoElement) {
								videoElement.srcObject = remoteStream
							} else {
								console.warn(`video element not found for peer ${fromId}`)
							}
						}
					})
					.catch((error) => {
						console.error('setRemoteDescription error: ', error)
					})
					.finally(() => {})
					
				}
			})

			userSocket.on('ice-candidate', (data) => {
				const fromId = data.fromId
				const candidateData = data.candidate
				console.log('candidate data: ', data)

				if(typeof peerListRef.current[fromId] != 'undefined') {
					peerListRef.current[fromId].addIceCandidate(candidateData)
					console.log('success icenCandidate')
				}
			})

			userSocket.on('peer-disconnected', (disconnectedClientId) => { // CleanUp disconnected client info
				console.log('peer-disconnected', disconnectedClientId)
				if(typeof peerListRef.current[disconnectedClientId] != 'undefined') {
					peerListRef.current[disconnectedClientId].close()
				}
				delete peerListRef.current[disconnectedClientId]
				delete dataChannelRef.current[disconnectedClientId]
				setPeerList((prev) => {
					const updated = { ...prev }
					delete updated[disconnectedClientId]
					return updated
				})
			})

		}
	}, [userSocket])

	const changeMessageText = (e) => {
		setMessageText(e.target.value)
	}

	const sendMessage = (peer) => {
		console.log('send success')
		console.log('dataChannelRef: ', dataChannelRef)
		if(typeof dataChannelRef.current[peer] != 'undefined') {
			dataChannelRef.current[peer].send(messageText)
		}
	}

	return (
		<>
			{ Object.keys(peerList).map((peer) => {
				return (
					<div key={ peer }>
						<video
							ref={el => {
								if (el) mediaRef.current[peer] = el
							}}
							autoPlay
							playsInline
							style={{ width: '300px', border: '1px solid black' }}
						/>
						<input type='text' onChange={(e) => changeMessageText(e)} value={ messageText } />
						<button onClick={() => sendMessage(peer)}>send to { peer }</button>
					</div>
				)
				
			}) }
		</>
	);
}

export default App