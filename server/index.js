const http = require('http');
const { Server } = require('socket.io');
const port = 3000
const server = http.createServer();
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:4000', 'http://localhost:3001'],
        methods: ['GET', 'POST']
    }
});
const peerList = {}
io.on('connection', (socket) => {
    console.log('Socket Connected: ', socket.id)

    const peerId = socket.handshake.query.peerId // connected client id
    console.log('My peerId: ', peerId)
    
    const socketKeyList = Array.from(io.sockets.sockets.keys())
    socketKeyList.map((key) => {
        const connectedSocket = io.sockets.sockets.get(key)
        if(connectedSocket) {
            const queryId = connectedSocket.handshake.query.peerId
            if(typeof peerList[queryId] === 'undefined') {
                peerList[queryId] = connectedSocket
            }
        }
    })
    console.log('socket list: ', socketKeyList)

    socket.emit('peer-connected', {
        peerList: Object.keys(peerList),
        peerId: peerId
    })
    
    socket.on('signal', (data) => {
        const toId = data.toId // Receiver
        const fromId = data.fromId // Sender
        const sdp = data.sdp // SDP data: offer, answer

        console.log('signal type: ', sdp.type)

        peerList[toId].emit('signal', data)
    })

    socket.on('ice-candidate', (data) => {
        const toId = data.toId
        const fromId = data.fromId
        const candidate = data.candidate

        peerList[toId].emit('ice-candidate', data)
        console.log('ice candidate on!')
    })

    socket.on('disconnect', (reason) => {
        console.log('disconnect', reason)
        delete peerList[peerId]
        socket.broadcast.emit('peer-disconnected', peerId)
    })
})


server.listen(port, () => {
    console.log('Server listening on port ' + port);
});