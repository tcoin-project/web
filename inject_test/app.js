const api = axios.create({ baseURL: 'https://tcrpc2.mcfx.us/' });

const opts = { dark: false };
Vue.use(Vuetify);

const Index = {
    template: `
    <v-col>
        <p><v-btn class="no-upper-case" outlined @click="run"> Test </v-btn></p>
        <p><v-btn class="no-upper-case" outlined @click="run2"> Test2 </v-btn></p>
        <p><v-btn class="no-upper-case" outlined @click="run3"> Test3 </v-btn></p>
    </v-col>
    `,
    data: function () {
        return {
        }
    },
    created: function () {
    },
    methods: {
        run: function () {
            wallet.connect().then(addr => {
                console.log(addr)
            })
        },
        run2: function () {
            wallet.disconnect()
        },
        run3: function () {
            wallet.approve({
                type: 1,
                toAddr: tcoin.decodeAddr('tcoin33YNRFhkr5r5PGRmi4VRfxK6wWW6bAiAjtgw5zRSw4YGKa'),
                value: 233,
                data: new Uint8Array([48, 49, 50]),
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