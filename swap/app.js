const api = axios.create({ baseURL: 'https://tcrpc2.mcfx.us/' });

const opts = { dark: false };
Vue.use(Vuetify);

Vue.component('wallet-connect', WalletConnect)

const tokens = [
    { addr: '', name: 'TCoin', symbol: 'TCoin', decimals: 9 },
    { addr: 'tcoin3QTdTxF3LtdyDCxtGFMbnqWJTZDMuwJqgkqhpZcaVxHRFP', name: 'Example Token', symbol: 'ET', decimals: 9 },
    { addr: 'tcoin2te7Jd2FURuw8VR96gdZd2qbCerSSUb7dnLAPAyS7sGLDM', name: 'Wrapped TCoin', symbol: 'WTCoin', decimals: 9 },
    { addr: 'tcoin3SAVJgv8SLBGFLSpddSeVzcrdMnQfAoLC7CGpAnmDYJRuF', name: 'ABC Coin', symbol: 'ABC', decimals: 9 },
]

function showToken(x, decimals) {
    const base = Math.pow(10, decimals)
    if (x % base == 0) {
        return (x / base).toString()
    }
    res = ((x - x % base) / base).toString() + '.' + (base + x % base).toString().substring(1)
    while (res.substring(res.length - 1) == '0') res = res.substring(0, res.length - 1)
    return res
}

async function genWorker(factory, addr, inputToken, outputToken, inputAmount) {
    const slippage = 0.01
    let tcoinAmount = 0, outputAmount = 0
    const asm = ['mv s0, ra', 'j rstart']
    const asm2 = ['rstart:']
    let curPos = 0x10000008
    console.log(inputAmount)
    if (inputToken.addr == '') {
        tcoinAmount = inputAmount
        asm2.push('li a0, ' + inputAmount)
    } else {
        const code = codegen.genWorker('read', factory, 'getExchange', 'aa', 0, [inputToken.addr])
        const res = await tcoin.runViewCode(addr, code)
        const inputExchange = codegen.parseResult('a', res.data)
        const code2 = codegen.genWorker('read', inputExchange, 'getTokenToTcoinInputPrice', 'ii', 0, [inputAmount])
        const res2 = await tcoin.runViewCode(addr, code2)
        tcoinAmount = codegen.parseResult('i', res2.data)
        asm.push(
            'input_exchange:',
            codegen.asAsmByteArr(tcoin.decodeAddr(inputExchange)),
            'input_token:',
            codegen.asAsmByteArr(tcoin.decodeAddr(inputToken.addr)),
        )
        const inputExchangePos = curPos
        curPos += 32 * 2
        asm.push(
            'approve_payload:',
            codegen.asAsmByteArr(codegen.int64ToBytes(inputExchangePos)),
            codegen.asAsmByteArr(codegen.int64ToBytes(inputAmount)),
            'input_exchange_payload:',
            codegen.asAsmByteArr(codegen.int64ToBytes(inputAmount)),
            codegen.asAsmByteArr(codegen.int64ToBytes(Math.round(tcoinAmount * (1 - slippage)))),
        )
        curPos += 16 * 2
        asm2.push(
            'la a0, input_token',
            'li t0, -72',
            'srli t0, t0, 1',
            'jalr t0',
            'mv t0, a0',
            'li a0, ' + codegen.selector('approve'),
            'la a1, approve_payload',
            'jalr t0',

            'la a0, input_exchange',
            'li t0, -72',
            'srli t0, t0, 1',
            'jalr t0',
            'mv t0, a0',
            'li a0, ' + codegen.selector('tokenToTcoinSwapInput'),
            'la a1, input_exchange_payload',
            'jalr t0',
        )
    }
    if (outputToken.addr == '') {
        outputAmount = tcoinAmount
    } else {
        const code = codegen.genWorker('read', factory, 'getExchange', 'aa', 0, [outputToken.addr])
        const res = await tcoin.runViewCode(addr, code)
        const outputExchange = codegen.parseResult('a', res.data)
        const code2 = codegen.genWorker('read', outputExchange, 'getTcoinToTokenInputPrice', 'ii', 0, [tcoinAmount])
        const res2 = await tcoin.runViewCode(addr, code2)
        outputAmount = codegen.parseResult('i', res2.data)
        asm.push(
            'output_exchange:',
            codegen.asAsmByteArr(tcoin.decodeAddr(outputExchange)),
        )
        asm2.push(
            'mv s1, a0',
            'la a0, output_exchange',
            'li t0, -72',
            'srli t0, t0, 1',
            'jalr t0',
            'li a1, ' + codegen.selector('tcoinToTokenSwapInput'),
            'li a2, ' + Math.round(outputAmount * (1 - slippage)),
            'mv a3, s1',
            'li a4, 1000000000',
            'addi a5, sp, -1200',
            'addi a6, a5, 8',
            'li t0, -80',
            'srli t0, t0, 1',
            'jalr t0',
            'lb t1, 0(a5)',
            'bne t1, zero, success',
            'mv a0, a6',
            'li t0, -88',
            'srli t0, t0, 1',
            'jalr t0',
            'success:',
        )
    }
    asm.push(
        ...asm2,
        'mv ra, s0',
        'ret',
    )
    return { amount: outputAmount, code: codegen.asmToBytes(asm.join('\n')) }
}

const Index = {
    template: `
    <v-row>
        <v-col md="12">
            <div style="display:inline-block;width:100%">
                <span style="float:left"><h2>Swap</h2></span>
                <span style="float:right"><wallet-connect @change="changeWallet" ref="wallet"></wallet-connect></span>
            </div>
        </v-col>
        <v-col md="4"><v-select v-model="inputToken" label="You sell" :items="tokens" item-text="symbol" return-object @input="debouncedFindRoute()"></v-select></v-col>
        <v-col md="8"><v-text-field v-model="inputAmount" label="Amount" @input="debouncedFindRoute()"></v-text-field></v-col>
        <v-col md="12">
            <p style="text-align:center">
                <v-btn text icon small @click="swapInputOutput">
                    <v-icon>mdi-swap-vertical</v-icon>
                </v-btn>
            </p>
        </v-col>
        <v-col md="4"><v-select v-model="outputToken" label="You buy" :items="tokens" item-text="symbol" return-object @input="debouncedFindRoute()"></v-select></v-col>
        <v-col md="8"><v-text-field v-model="outputAmount" label="Amount" readonly></v-text-field></v-col>
        <v-col md="12">
            <v-alert dense type="error" icon="mdi-alert" v-if="alertMsg != ''"> {{ alertMsg }} </v-alert>
        </v-col>
        <v-col md="12">
            <p style="text-align:center">
                <v-btn class="no-upper-case" outlined @click="swap"> Swap </v-btn>
            </p>
        </v-col>
    </v-row>
    `,
    data: function () {
        return {
            factory: 'tcoin2tZtjoCsVgtSNfw1PJG5nJQ3gkR5VMaRoW3MMiodwz5PhU',
            addr: tcoin.encodeAddr(tcoin.nullAddr),
            inputAmount: 0,
            inputToken: tokens[0],
            outputAmount: 0,
            outputToken: tokens[1],
            alertMsg: '',
        }
    },
    computed: {
        intAmount: function () {
            return Math.floor(this.amount * 1000000000)
        }
    },
    created: function () {
        this.debouncedFindRoute = _.debounce(() => { this.findRoute() }, 200)
    },
    methods: {
        changeWallet: function (addr) {
            this.addr = addr == '' ? tcoin.encodeAddr(tcoin.nullAddr) : addr
        },
        swapInputOutput: function () {
            const tmp = this.inputToken
            this.inputToken = this.outputToken
            this.outputToken = tmp
            this.inputAmount = this.outputAmount
            this.debouncedFindRoute()
        },
        findRoute: function () {
            if (this.inputToken.addr == this.outputToken.addr && false) {
                this.alertMsg = "input and output token can't be the same"
                return
            }
            const intAmount = Math.round(this.inputAmount * Math.pow(10, this.inputToken.decimals))
            if (intAmount == 0) {
                this.alertMsg = "input amount can't be zero"
            }
            this.alertMsg = ''
            genWorker(this.factory, this.addr, this.inputToken, this.outputToken, intAmount).then(res => {
                this.outputAmount = showToken(res.amount, this.outputToken.decimals)
            })
        },
        swap: function () {
            const intAmount = Math.round(this.inputAmount * Math.pow(10, this.inputToken.decimals))
            genWorker(this.factory, this.addr, this.inputToken, this.outputToken, intAmount).then(res => {
                this.$refs.wallet.approve({
                    type: 2,
                    toAddr: tcoin.nullAddr,
                    value: 0,
                    data: res.code,
                }).then(tx => {
                    tcoin.sendTransaction(tx)
                })
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