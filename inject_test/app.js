const api = axios.create({ baseURL: 'https://tcrpc2.mcfx.us/' });

const opts = { dark: false };
Vue.use(Vuetify);

const Index = {
    template: `
    <v-col>
        <p><v-btn class="no-upper-case" outlined @click="connect"> Connect Wallet </v-btn></p>
        <p><v-btn class="no-upper-case" outlined @click="disconnect"> Disconnect Wallet </v-btn></p>
        <p><v-btn class="no-upper-case" outlined @click="deposit"> Deposit 1 TCoin to WTCoin </v-btn></p>
        <p><v-btn class="no-upper-case" outlined @click="withdraw"> Withdraw 1 TCoin to WTCoin </v-btn></p>
    </v-col>
    `,
    methods: {
        connect: function () {
            wallet.connect().then(addr => {
                console.log(addr)
            })
        },
        disconnect: function () {
            wallet.disconnect()
        },
        deposit: function () {
            wallet.approve({
                type: 2,
                toAddr: tcoin.decodeAddr('tcoin2K3n5t4wSaF5mj27Tw9vStXWLWyRjjiH5Cp3CFLpKVCr1d'),
                value: 0,
                data: fromHex('138400001705000013058505930280fb93d21200e7800200930405006f00400013850400b7d5896f9b85956113060000b7d69a3b9b8606a037d79a3b1b0707a0930701b513888700930200fb93d21200e7800200930004006780000071149a92dfbd9be935292722045f9db6b6bcba6d7c09ffb191d8d9b4ea04a46c'),
            }).then(tx => {
                tcoin.sendTransaction(tx)
            })
        },
        withdraw: function () {
            wallet.approve({
                type: 2,
                toAddr: tcoin.decodeAddr('tcoin2K3n5t4wSaF5mj27Tw9vStXWLWyRjjiH5Cp3CFLpKVCr1d'),
                value: 0,
                data: fromHex('138400001705000013058503930280fb93d21200e7800200930405006f0040003715f9511b058509b7d59a3b9b8505a0e7800400930004006780000071149a92dfbd9be935292722045f9db6b6bcba6d7c09ffb191d8d9b4ea04a46c'),
            }).then(tx => {
                tcoin.sendTransaction(tx)
            })
        }
    }
}

const router = new VueRouter({
    mode: 'hash',
    routes: [
        { path: '/', component: Index, name: 'index' },
    ]
})

new Vue({
    router,
    el: '#app',
    vuetify: new Vuetify(opts)
})