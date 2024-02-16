const jwt = require('jsonwebtoken')
const statusCode = require('../utils/http-response').httpStatus_keyValue
const sql = require('../database/db')

function throw_err(msg, code) {
    const err = new Error(msg)
    err.statusCode = code 
    throw err
}

module.exports = async (req, res, next) => {
    try {

        const authToken = req.get('Authorization')
        if(!authToken) {
            throw_err('Needed Bearer Authorization Header', statusCode['401_unauthorized'])
        }

        const token = authToken.split(' ')[1]
        if(!token) {
            throw_err('Needed Bearer Authorization Header', statusCode['401_unauthorized'])
        }

        const decode_token = jwt.verify(token, process.env.JWT_SECRET)
        if(!decode_token) {
            throw_err('Invalid Token/ Token Expired', statusCode['401_unauthorized'])
        }

        const user = (await sql.query('select id, username, name, user_type, is_member from users where id = ? limit 1', [decode_token.user_id]))[0]
        if(user.length === 0) {
            throw_err('User not found, token not valid', statusCode['401_unauthorized'])
        }

        req.user_id = user[0].id
        req.role = user[0].user_type 
        req.is_member = user[0].is_member
        
        next()

    } catch(e) {
        if(!e.statusCode){
            e.statusCode = statusCode['500_internal_server_error']
        }
        next(e)
    }
}