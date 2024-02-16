// * DEPENDENCIES
require('dotenv').config();
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const bodyParser = require('body-parser')
const yamljs = require('yamljs')
const swaggerUI = require('swagger-ui-express')
const morgan = require('morgan')
const sql = require('./database/db')

// * YAML API Spec
const openAPISpec = yamljs.load('./utils/swagger.yaml')

// * PORTS
const PORT = process.env.PORT || 8086

// * ROUTES
const authRouter = require('./routes/auths')
const userRouter = require('./routes/users')
const linkRouter = require('./routes/urls')

// * APP ======================
const app = express()  

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(cors())
app.use(helmet({
    contentSecurityPolicy: false, // disable content security policy
    hidePoweredBy: true, // hide X-Powered-By header
    hsts: false, // { maxAge: 31536000, includeSubDomains: true }, // enable HSTS with maxAge 1 year and includeSubDomains
    noCache: true, // enable noCache header
    referrerPolicy: { policy: 'no-referrer' } // set referrer policy to no-referrer
}))
// * logger middleware for console
const customLogFormat = ':date[iso] | :method | :url | :status | :res[content-length] - :response-time ms'
app.use(morgan(customLogFormat))


// * ROUTING SET
app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(openAPISpec))
app.use(authRouter)
app.use('/users', userRouter)
app.use('/links', linkRouter)


// * GLOBAL ERROR HANDLING
app.use((err, req, res, next) => {
    console.log(err)
    const status = err.statusCode || 500 
    const message = err.message 
    res.status(status).json({
        errors: true, 
        message: message
    })
})


// * APP CONNECTION
function startServer() {
    try {
        app.listen(PORT, async () => {
            await sql.ping
            
            console.log(`Server is running on port ${PORT}`)
            console.log('Database connection is successful')
        })
    } catch (e) {
        console.log(e)
        process.exit(1)
    }
}
startServer()