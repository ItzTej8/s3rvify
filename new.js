import pkg from "whatsapp-web.js"
import qrcode from "qrcode-terminal"
import makeFetchCookie from "fetch-cookie"
import { CookieJar } from "tough-cookie"
import dotenv from "dotenv"

dotenv.config()

const { Client, LocalAuth } = pkg

// ================= GLOBALS =================
const cookieJar = new CookieJar()
const fetch = makeFetchCookie(global.fetch, cookieJar)

let servifyToken = ""
let uuid = ""
let authorization = ""
let cookieHeader = ""
let tokenExpiry = 0

let productList = []
const userState = {}

const {
    SERVIFY_LOGIN,
    SERVIFY_PASSWORD,
    COUNTRY_CODE,
    PARTNER_ID
} = process.env

// ================= SAFE FETCH =================
const safeFetch = async (url, options, retry = true) => {
    try {
        const res = await fetch(url, options)

        if (res.status === 401 && retry) {
            console.log("🔄 Token expired. Re-logging...")
            await loginServify()
            return safeFetch(url, options, false)
        }

        return res
    } catch (err) {
        console.error("Fetch error:", err)
        throw err
    }
}

// ================= LOGIN =================
const loginServify = async () => {

    console.log("🔐 Logging into Servify...")

    const r = await fetch("https://360.servify.in/userLogin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            loginId: SERVIFY_LOGIN,
            password: SERVIFY_PASSWORD
        })
    })

    const cookies = r.headers.getSetCookie?.() || []

    const parsed = Object.fromEntries(
        cookies.map(c => {
            const [pair] = c.split(";")
            const [k, v] = pair.split("=")
            return [k, v]
        })
    )

    authorization = parsed.authorization
    uuid = parsed.UID
    cookieHeader = `authorization=${authorization}; UID=${uuid}`

    const j = await r.json()

    console.log(j)

    if (j?.data?.token) {
        servifyToken = j.data.token
        tokenExpiry = Date.now() + (1000 * 60 * 20) // 20 min expiry
        console.log("✅ Servify Logged In")
    } else {
        throw new Error("Login failed")
    }
}

// ================= AUTO TOKEN CHECK =================
const ensureTokenValid = async () => {
    if (!servifyToken || Date.now() > tokenExpiry) {
        await loginServify()
    }
}

// ================= LOAD PRODUCTS =================
const loadSubCategories = async () => {

    await ensureTokenValid()

    const r = await safeFetch(
        "https://360.servify.in/api/v1/Aegis/getPlanSubCategories",
        {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "cookie": cookieHeader,
                "uuid": uuid
            },
            body: JSON.stringify({
                CountryCode: COUNTRY_CODE,
                salesChannel: "ASC-Portal",
                LanguageCode: "en-IN"
            })
        }
    )

    const j = await r.json()
    productList = j?.data || []

    console.log("✅ Subcategories Loaded:", productList.length)
}

// ================= FETCH PRODUCT =================
const fetchProduct = async (modelNo, subCatID) => {

    await ensureTokenValid()

    const r = await safeFetch(
        "https://360.servify.in/api/v1/Aegis/getPlanProductSKUModelNos",
        {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "uuid": uuid,
                "cookie": cookieHeader
            },
            body: JSON.stringify({
                BrandID: 2,
                ProductSubCategoryID: Number(subCatID),
                CountryID: "MTA1",
                app: "360App",
                ProductSkuModelNo: modelNo,
                pagination: {
                    pageNo: 1,
                    range: 3,
                    itemsPerPage: 3
                }
            })
        }
    )

    const j = await r.json()
    return j?.data?.skuModelList || []
}

// ================= FETCH PLANS =================
const fetchPlans = async (modelNo, productID) => {

    await ensureTokenValid()

    const r = await safeFetch(
        "https://360.servify.in/api/v1/Aegis/fetchEligiblePlans",
        {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "authorization": servifyToken
            },
            body: JSON.stringify({
                ProductID: productID,
                BrandID: 2,
                CountryCode: COUNTRY_CODE,
                PartnerID: PARTNER_ID,
                ModelNo: modelNo
            })
        }
    )

    const j = await r.json()
    return j?.data?.find(x => x?.PlanObject)?.PlanObject || []
}

// ================= WHATSAPP BOT =================
const startBot = async () => {

    await loginServify()
    await loadSubCategories()

    const client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        }
    })

    client.on("qr", qr => {
        qrcode.generate(qr, { small: true })
        console.log("📱 Scan QR")
    })


    /*

Group Name : Sales lead report Krishna Air Co. Service
Group ID   : 120363158598107900@g.us


Group Name : Krishna air co Team
Group ID   : 120363217957933482@g.us

Group Name :  Krishna Back office..✨
Group ID   : 120363348855885631@g.us

    */

    client.on("ready", async () => {
        console.log("✅ WhatsApp Ready");


        const chats = await client.getChats()

        const groups = chats.filter(chat => chat.isGroup)

        console.log(`Found ${groups.length} groups:\n`)

        groups.forEach(group => {
            console.log(`Group Name : ${group.name}`)
            console.log(`Group ID   : ${group.id._serialized}`)
            console.log("---------------------------")
        })

    })

    client.on("disconnected", reason => {
        console.log("❌ WhatsApp Disconnected:", reason)
        client.initialize()
    })

    // allowed groups
    const allowedGroups = new Set([
        "120363420977770640@g.us",
        "120363158598107900@g.us", // Sales lead report Krishna Air Co. Service
        "120363217957933482@g.us", // Krishna air co Team
        "120363348855885631@g.us"  // Krishna Back office..✨
    ])

    client.on("message", async msg => {

        // ignore own messages
        if (msg.fromMe) return

        const jid = msg.from
        const chat = await msg.getChat()

        // ✅ allow private chats
        const isPrivate = !chat.isGroup

        // ✅ allow only selected groups
        const isAllowedGroup = chat.isGroup && allowedGroups.has(chat.id._serialized)

        // ignore other groups
        if (!isPrivate && !isAllowedGroup) return

        const input = msg.body.trim()
        const state = userState[jid]

        // start command
        if (input.toLowerCase() === "carepack") {

            userState[jid] = { step: "product" }

            let menu = "📦 *Select Product:*\n"
            productList.forEach((p, i) => {
                menu += `\n${i + 1}. ${p.ProductSubCategory}`
            })

            return msg.reply(menu)
        }

        if (!state) return

        // product selection
        if (state.step === "product") {

            const n = parseInt(input)
            if (!n || n < 1 || n > productList.length) return

            const selected = productList[n - 1]

            state.subCatID = selected.ProductSubCategoryID
            state.productName = selected.ProductSubCategory
            state.step = "model"

            return msg.reply(`📦 *${state.productName}*\nEnter Model Number`)
        }

        // model step
        if (state.step === "model") {

            await msg.reply("⏳ Checking...")

            const models = await fetchProduct(input, state.subCatID)

            if (!models.length) {
                delete userState[jid]
                return msg.reply("❌ Model not found")
            }

            const productID = models[0].productID
            const plans = await fetchPlans(input, productID)

            const valid = plans.filter(p => p?.PlanName && p?.PlanPrice)

            if (!valid.length) {
                delete userState[jid]
                return msg.reply("❌ No plans available")
            }

            let reply = "📋 *CarePack Plans*\n\n"

            valid.forEach((p, i) => {
                reply += `*${i + 1}. ${p.PlanName}*\n`
                reply += `💰 ₹${p.PlanPrice}\n`
                reply += `🆔 ${p.ExternalPlanCode}\n\n`
            })

            if (plans[0].AboutLink) {
                reply += `🔗 Terms: ${plans[0].AboutLink}`
            }

            delete userState[jid]
            return msg.reply(reply)
        }

    })

    client.initialize()
}

// ================= GLOBAL ERROR HANDLER =================
process.on("unhandledRejection", err => {
    console.error("Unhandled Rejection:", err)
})

process.on("uncaughtException", err => {
    console.error("Uncaught Exception:", err)
})

startBot()
