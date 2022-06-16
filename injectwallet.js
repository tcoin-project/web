const wallet = (function () {
    const walletUrl = 'https://portal.tcoin.dev/wallet/#/inject'
    const walletOrigin = walletUrl.substring(0, walletUrl.indexOf('/', 7))
    var popup, currentPromise, currentRequest

    function checkReset(msg) {
        if (typeof (popup) != 'undefined') {
            popup.close()
            const [_, reject] = currentPromise
            popup = undefined
            currentPromise = undefined
            currentRequest = undefined
            reject(new Error(msg || 'operation canceled by user'))
        }
    }

    window.addEventListener('message', (event) => {
        if (event.origin != walletOrigin) return
        if (event.data.target != 'tcoin-wallet') return
        const data = event.data.data
        const method = data.method
        const arg = data.arg
        if (method == 'load') {
            popup.postMessage(currentRequest)
            return
        }
        if (method == 'unload') {
            checkReset()
            return
        }
        if (method == 'error') {
            checkReset(arg)
            return
        }
        if (typeof (currentRequest) != 'undefined' && method == currentRequest.data.method) {
            const [resolve, _] = currentPromise
            popup.close()
            popup = undefined
            currentPromise = undefined
            currentRequest = undefined
            resolve(arg)
        }
    }, false)

    function sendRequest(method, arg) {
        checkReset()
        currentRequest = { target: 'tcoin-wallet', data: { method: method, arg: arg } }
        popup = window.open(walletUrl, '_blank', 'location,resizable,width=560,height=700')
        return new Promise((resolve, reject) => {
            currentPromise = [resolve, reject]
        })
    }

    return {
        connect: async function () {
            return await sendRequest('connect', '')
        },
        disconnect: async function () {
            return await sendRequest('disconnect', '')
        },
        approve: async function (tx) {
            return await sendRequest('approve', tx)
        }
    }
})()