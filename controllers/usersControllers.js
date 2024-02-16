require('dotenv')
const sql = require('../database/db')
const statusCode = require('../utils/http-response').httpStatus_keyValue
const { validationResult } = require('express-validator')
const bcrypt = require('bcrypt')


// * ------------------------- FUNCTION ------------------------- * //

function throw_err(msg, code) {
    const err = new Error(msg)
    err.statusCode = code 
    throw err
}


// * ----------------------- CONTROLLER ----------------------- * //


// ! ------------------------ GET ------------------------ ! #

exports.get_all_users = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1 
        const size = parseInt(req.query.per_page) || 10
        const offset = (page - 1) * size 
        const sort = req.query.sort
        const search = req.query.search
        const is_member = req.query.is_member === '1' ? true : false 
        const user_type = req.query.user_type

        // * query builder schema
        let query = 'select id, username, name, user_type, is_member, created_at, edited_at, last_login from users where 1=1'

        if(search) {
            // ? for searching -> by USERNAME and NAME
            query = query + ` and (username like '%${search}%' or name like '%${search}%')`
        }

        if(is_member) {
            query = query + ' and is_member = 1'
        }

        if(user_type) {
            query = query + ' and user_type = ' + user_type
        }

        if(sort) {
            switch (sort) {
                case 'created_at_newest':
                    query = query + ' order by created_at desc';
                    break;
                case 'created_at_oldest':
                    query = query + ' order by created_at asc';
                    break;
                case 'last_login_newest':
                    query = query + ' order by last_login desc';
                    break;
                case 'last_login_oldest':
                    query = query + ' order by last_login asc';
                    break;
                default:
                    break;
            }
        }

        const total_data = (await sql.query(query))[0].length

        query = query + ' limit ' + size + ' offset ' + offset

        const user_data = (await sql.query(query))[0]

        res.status(statusCode['200_ok']).json({
            errors: false,
            message: 'get users data',
            data: {
                page: page,
                per_page: size,
                total_data: total_data,
                users: user_data
            }
        })

    } catch (e) {
        if(!e.statusCode) {
            e.statusCode = statusCode['500_internal_server_error']
        }
        next(e)
    }
}





exports.get_user_info_admin = async (req, res, next) => {
    // * get info user with username input in params (admin only)
    try {

        const username = req.params.username 
        if(!username) {
            throw_err('Username not inputted', statusCode['400_bad_request'])
        }

        // * get user data
        let user = (await sql.query('select id, username, name, user_type, is_member, created_at, edited_at, last_login from users where BINARY username = ? limit 1', [username]))[0]

        if(user.length === 0) {
            user = {}
        } else {
            user = user[0]

            // * get members data from user
            const members_data = (await sql.query('select id, user_id, start_date, end_date, is_active, terminated_type, terminated_date from members where user_id = ? order by start_date desc', [user.id]))[0]

            user.membership_history = members_data
        }

        res.status(statusCode['200_ok']).json({
            errors: false,
            message: 'get user data',
            data: user
        })

    } catch (e) {
        if(!e.statusCode) {
            e.statusCode = statusCode['500_internal_server_error']
        }
        next(e)
    }
}





exports.get_user_self = async (req, res, next) => {
    try {

        const user_id = req.user_id 
        if(!user_id) {
            throw_err('Authorization Invalid, try again!', statusCode['404_not_found'])
        }

        // * get user data
        let user = (await sql.query('select id, username, name, user_type, is_member, created_at, edited_at, last_login from users where id = ? limit 1', [user_id]))[0]

        if(user.length === 0) {
            throw_err('User not found, error on token', statusCode['404_not_found'])
        } else {
            user = user[0]
            // * get members data from user
            const members_data = (await sql.query('select id, user_id, start_date, end_date, is_active, terminated_type, terminated_date from members where user_id = ? order by start_date desc', [user_id]))[0]

            // * get links data from user
            const links_data = (await sql.query('select id, short_url, long_url, created_at, expired_at, is_active, last_visited, total_visited from urls where user_id = ? order by created_at desc', [user_id]))[0]

            user.membership_history = members_data
            user.links_data = links_data
        }

        res.status(statusCode['200_ok']).json({
            errors: false,
            message: 'get user self info',
            data: user
        })

    } catch (e) {
        if(!e.statusCode) {
            e.statusCode = statusCode['500_internal_server_error']
        }
        next(e)
    }
}





exports.check_username_availability = async (req, res, next) => {
    try {

        const {username} = req.query 
        if(!username || username.trim().length < 5) {
            throw_err('Username input minimal have 5 character', statusCode['400_bad_request'])
        }

        const user = (await sql.query('select id from users where BINARY username = ? limit 1', [username]))[0]
        if(user.length > 0) {
            return res.status(statusCode['200_ok']).json({
                errors: false,
                message: 'check username',
                data: {
                    available: false,
                    username: username
                }
            })
        }

        res.status(statusCode['200_ok']).json({
            errors: false,
            message: 'check username',
            data: {
                available: true,
                username: username
            }
        })

    } catch (e) {
        if(!e.statusCode) {
            e.statusCode = statusCode['500_internal_server_error']
        }
        next(e)
    }
}





// ! ------------------------ POST ------------------------ ! #

exports.create_account_user = async (req, res, next) => {
    // * trying use one controller for 2 different route for efficiency
    // * used on /signup and /members (POST method (admin only))
    try {
        // * check validation error
        const val_err = validationResult(req)
        if(!val_err.isEmpty()) {
            throw_err(val_err.array()[0].msg, statusCode['400_bad_request'])
        }

        const { 
            username, password, 
            password_confirmation, name,
            is_by_admin
        } = req.body
        let user_type

        // * check password confirmation
        if(password !== password_confirmation) {
            throw_err('Password confirmation does not match', statusCode['400_bad_request'])
        }

        const hashedPassword = await bcrypt.hash(password, 12)
        const created_at = new Date()
        const edited_at = created_at
        const is_member = false
        if(is_by_admin) {
            // * if req from admin
            if(req.role !== 1 ) {
                throw_err('You are not authorized to create new user (not admin)', statusCode['401_unauthorized'])
            }
            user_type = req.body.user_type
        } else {
            // * if using signup
            user_type = 2
        }

        // * insert new user
        const newUser = await sql.query('INSERT INTO users (username, password, name, user_type, is_member, created_at, edited_at) VALUES (?, ?, ?, ?, ?, ?, ?) ', [username, hashedPassword, name, user_type, is_member, created_at, edited_at])

        res.status(statusCode['200_ok']).json({
            errors: false,
            message: 'success create account',
            data: {
                id: newUser[0].insertId,
                username: username,
                name: name,
                created_at: created_at,
            }
        })

    } catch (e) {
        // * just in case username already exist 
        if(e.code === 'ER_DUP_ENTRY') {
            e.statusCode = statusCode['400_bad_request']
            e.message = 'Username already exist, please use another username'
        }

        if(!e.statusCode) {
            e.statusCode = statusCode['500_internal_server_error']
        }
        next(e)
    }
}





exports.post_members = async (req, res, next) => {

    let connection

    try {
        connection = await sql.getConnection()
        await connection.beginTransaction()

        let { is_admin, user_id } = req.body
        if(is_admin) {
            // ? if this req submitted with body req with "is_admin", consider this req from admin -> check the attribute first and create new member from the user id provided
            if(req.role !== 1) {
                throw_err('You are not authorized to create new member', statusCode['401_unauthorized'])
            }

            if(is_admin !== 1) {
                throw_err('is_admin data must be provided and set to 1', statusCode['400_bad_request'])
            }

            if(!user_id) {
                throw_err('user_id must be provided', statusCode['400_bad_request'])
            }
            
        } else {
            // ? if req without body -> consider from user -> create new member from the user itself
            if(req.role === 1) {
                throw_err('You are not authorized to create new member (not user)', statusCode['401_unauthorized'])
            }

            user_id = req.user_id
        }

        // * check user id provided by admin or user (by the token)
        let user = (await connection.query('select id, username, user_type, is_member from users where id = ? limit 1', [user_id]))[0]
        if(user.length === 0) {
            throw_err('User not found, check id user again', statusCode['404_not_found'])
        }

        user = user[0]

        if(user.is_member === 1){
            return res.status(statusCode['200_ok']).json({
                errors: false,
                message: 'user already member and still active'
            })
        }

        // * update user member status
        await connection.query('update users set is_member = 1 where id = ?', [user_id])

        // * input new data member on members table
        const start_date = new Date()
        const end_date = new Date(start_date)
        end_date.setMonth(end_date.getMonth() + 1) // 1month 
        await connection.query('insert into members (user_id, start_date, end_date, is_active) values(?, ?, ?, ?)', [user_id, start_date, end_date, 1])

        await connection.commit()

        res.status(statusCode['200_ok']).json({
            errors: false,
            message: 'success create new member'
        })

    } catch (e) {

        if(connection) {
            await connection.rollback()
            connection.release()
        }

        console.error('error post_members: ', e)

        if(!e.statusCode) {
            e.statusCode = statusCode['500_internal_server_error']
        }
        next(e)
    }
}





exports.stop_membership = async (req, res, next) => {
    
    let connection

    try {
        connection = await sql.getConnection()
        connection.beginTransaction()

        const { user_id } = req.body
        if (!user_id) {
            throw_err('user_id must be provided', statusCode['400_bad_request'])
        }

        let user = (await sql.query('select id, username, user_type, is_member from users where id = ? limit 1', [user_id]))[0]
        if(user.length === 0) {
            throw_err('User not found, check id user again', statusCode['404_not_found'])
        }

        user = user[0]

        // * check if the user membership is active
        if(user.is_member === 0 || user.user_type === 1){
            if(user.user_type === 1) {
                throw_err('You are not authorized (you admin)', statusCode['401_unauthorized'])
            } else {
                return res.status(statusCode['200_ok']).json({
                    errors: false,
                    message: 'user already not member'
                })
            }
        }

        // * stop user membership on users status and members table -> terminated by admin -> terminated_type = 2
        await connection.query('update users set is_member = 0 where id = ?', [user_id])

        const timeNow = new Date()
        await connection.query('update members set is_active = 0, terminated_type = 2, terminated_date = ? where user_id = ? and is_active = 1', [timeNow, user_id])

        await connection.commit()

        res.status(statusCode['200_ok']).json({
            errors: false,
            message: 'success stop user membership'
        })

    } catch (e) {

        if(connection) {
            await connection.rollback()
            connection.release()
        }

        console.error('error stop_membership: ', e)

        if(!e.statusCode) {
            e.statusCode = statusCode['500_internal_server_error']
        }
        next(e)
    }
}





// ! ------------------------ PATCH ------------------------ ! #

exports.update_user_info = async (req, res, next) => {
    // * for edit password and edit user info merge to becouse of the same endpoint and just using this one controllers
    let connection 
    let message_success
    
    try {
        const val_err = validationResult(req)
        if(!val_err.isEmpty()) {
            throw_err(val_err.array()[0].msg, statusCode['400_bad_request'])
        }

        connection = await sql.getConnection()
        connection.beginTransaction()

        const { name, password_now, new_password, is_edit_info } = req.body

        let user = (await connection.query('select id, username, password, name, user_type, is_member from users where id = ? limit 1', [req.user_id]))[0] 
        if(user.length === 0) {
            throw_err('User not found, Token Invalid', statusCode['401_unauthorized'])
        }

        if(is_edit_info) {
            // ! if is_edit_info = true consider this for edit user info

            await connection.query('update users set name = ? where id = ?', [name, req.user_id])

            message_success = 'success update user info'

        } else {
            // ! if is_edit_info = false consider this for edit password
            if(!password_now) {
                // * check if password_now is not provided, because this not checked on routing
                throw_err('password_now must be provided on request body', statusCode['400_bad_request'])
            }


            // * check if password_now is the same for the password user 
            const check_password = await bcrypt.compare(password_now, user[0].password)
            if(!check_password) {
                throw_err('Your password input wrong', statusCode['400_bad_request'])
            }

            // * hash new password and update user new password in database
            const new_password_hash = await bcrypt.hash(new_password, 12)
            await connection.query('update users set password = ? where id = ?', [new_password_hash, req.user_id] )

            message_success = 'success change user password'
        }        

        await connection.commit()

        res.status(statusCode['200_ok']).json({
            errors: false,
            message: message_success
        })

    } catch (e) {

        if(connection) {
            await connection.rollback()
            connection.release()
        }

        console.error('error update_user_info: ', e)

        if(!e.statusCode) {
            e.statusCode = statusCode['500_internal_server_error']
        }
        next(e)
    }    
}