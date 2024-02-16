const router = require('express').Router();
const authController = require('../controllers/authControllers')
const userController = require('../controllers/usersControllers')
const { body } = require('express-validator')
const sql = require('../database/db')

// * ------------------------- ROUTING ------------------------- * //

router.post('/login', authController.login)

router.post('/signup', [
    body('username', 'Username must be at least 5 characters long')
        .trim()
        .isAlphanumeric()
        .isLength({ min: 5 })
        .custom((value, {req}) => {
            return (async () => {
                const user = (await sql.query('select * from users where BINARY username = ? limit 1', [value]))[0]
                if(user.length > 0) {
                    const err = new Error('Username already taken, please choose another one')
                    err.statusCode = 400 
                    throw err
                }
            })()
        }),
    body('password', 'Password must be minimal 6 characters long with at least 1 number and 1 capital letter')
        .isStrongPassword({
            minLength: 6,
            minNumbers: 1,
            minLowercase: 0,
            minSymbols: 0,
            minUppercase: 1,
        })
], userController.create_account_user)


module.exports = router