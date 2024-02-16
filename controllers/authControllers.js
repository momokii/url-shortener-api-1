require('dotenv')
const statusCode = require('../utils/http-response').httpStatus_keyValue
const sql = require('../database/db')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { validationResult } = require('express-validator')


// * ------------------------- FUNCTION ------------------------- * //

function throw_err(msg, code) {
    const err = new Error(msg)
    err.statusCode = code 
    throw err
}


// * ----------------------- CONTROLLER ----------------------- * //

exports.login = async (req, res, next) => {

    let connection

    try {
        // * get username and password from req.body
        const { username, password } = req.body
        if(!username || !password) {
            throw_err('username and password must be provided', statusCode['400_bad_request'])
        }

        connection = await sql.getConnection()
        await connection.beginTransaction()

        // * check user in database & check user password
        const user = (await connection.query('SELECT * FROM users WHERE username = ? limit 1', [username]))[0] // get user from database
        if(user.length === 0) {
            throw_err('Username or password wrong', statusCode['400_bad_request'])
        }

        const check_password = await bcrypt.compare(password, user[0].password)
        if(!check_password) {
            throw_err('Username or password wrong', statusCode['400_bad_request'])
        }

        // * create JWT token 
        const token = jwt.sign({
            user_id: user[0].id,
        }, 
        process.env.JWT_SECRET, 
        { expiresIn: '7d' })


        // * update last login
        const timeNow = new Date()
        await connection.query('update users set last_login = ? where id = ?', [timeNow, user[0].id])

        await connection.commit()

        res.status(statusCode['200_ok']).json({
            errors: false,
            message: 'success login',
            data: {
                token: token,
                token_type: 'JWT',
                expires_in: '7d',
            }
        })

    } catch (e) {

        if(connection) {
            await connection.rollback()
            connection.release()    
        }
        
        console.error('error login: ', e)

        if(!e.statusCode) {
            e.statusCode = statusCode['500_internal_server_error']
        }
        next(e)
    }
}