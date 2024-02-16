const router = require('express').Router()
const usersControllers = require('../controllers/usersControllers')
const linksControllers = require('../controllers/linksControllers')
const is_admin = require('../middleware/role-checking').is_admin
const is_auth = require('../middleware/is-auth')
const { body } = require('express-validator')
const sql = require('../database/db')

router.get('/', is_auth, is_admin, usersControllers.get_all_users)

router.get('/self', is_auth, usersControllers.get_user_self)

router.get('/check-username', is_auth, usersControllers.check_username_availability)

router.get('/:username', is_auth, is_admin,  usersControllers.get_user_info_admin)

router.post('/', is_auth, is_admin, [
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
], usersControllers.create_account_user)

router.post('/links', is_auth, linksControllers.post_link)

router.post('/members/terminated', is_auth, is_admin, usersControllers.stop_membership)

router.post('/members', is_auth, usersControllers.post_members)

router.patch('/self/password', is_auth, [
    body('new_password', 'New Password must be minimal 6 characters long with at least 1 number and 1 capital letter')
        .isStrongPassword({
            minLength: 6,
            minNumbers: 1,
            minLowercase: 0,
            minSymbols: 0,
            minUppercase: 1,
        })
], usersControllers.update_user_info)

router.patch('/self', is_auth, [
    body('name', 'new name minimal 3 characters')
        .isLength({ min: 3 }),
], usersControllers.update_user_info)

module.exports = router