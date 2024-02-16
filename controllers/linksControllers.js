require('dotenv')
const statusCode = require('../utils/http-response').httpStatus_keyValue
const sql = require('../database/db')
const { validationResult } = require('express-validator')

// * ------------------------- FUNCTION ------------------------- * //

function throw_err(msg, code) {
    const err = new Error(msg)
    err.statusCode = code 
    throw err
}

function generate_random_string(length) {
    // * rata rata random string short link 7-8 char
    const char = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomstr = ''
    for (let i = 0; i < length; i++) {
        randomstr += char.charAt(Math.floor(Math.random() * char.length))
    }

    return randomstr
}


// * ----------------------- CONTROLLER ----------------------- * //


// ! ------------------------ GET ------------------------ ! #

exports.get_all_links = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1 
        const size = parseInt(req.query.per_page) || 5
        const offset = (page - 1) * size 
        const sort = req.query.sort  
        const is_user = req.query.is_user === '1' ? true : false 
        const search = req.query.search

        let query = 'select id, short_url, long_url, created_at, expired_at, is_active, last_visited, total_visited, user_id from urls where 1=1'

        if(is_user) {
            query += ' and user_id is not null'
        }

        if(search) {
            // ? search in url is by -> SHORT/LONG URL NAME
            query += ` and (short_url like '%${search}%' or long_url like '%${search}%')`
        }

        if(sort) {
            switch (sort) {
                case 'created_at_newest':
                    query += ' order by created_at desc'
                    break 

                case 'created_at_oldest':
                    query += ' order by created_at asc'
                    break

                case 'total_visited_desc':
                    query += ' order by total_visited desc'
                    break

                case 'total_visited_asc':
                    query += ' order by total_visited asc'
                    break

                case 'last_visited_newest':
                    query += ' order by last_visited desc'
                    break
                
                case 'last_visited_oldest':
                    query += ' order by last_visited asc'
                    break

                default:
                    break
            }
        }

        const total_data = (await sql.query(query))[0].length 

        query = query + ' limit ' + size + ' offset ' + offset

        const links = (await sql.query(query))[0]

        res.status(statusCode['200_ok']).json({
            errors: false, 
            message: 'get links data',
            data: {
                page: page,
                per_page: size,
                total: total_data,
                links: links
            }
        })

    } catch (e) {
        if(!e.statusCode) {
            e.statusCode = statusCode['500_internal_server_error']
        }

        next(e)
    }

}



exports.get_link = async (req, res, next) => {
    try {
        const short_link = req.params.short_url 
        let link_data = (await sql.query('select short_url, long_url, created_at, expired_at, is_active, last_visited, total_visited, user_id from urls where BINARY short_url = ? limit 1', [short_link]))[0]

        if(link_data.length === 0) {
            throw_err('Link not found', statusCode['404_not_found'])
        }

        link_data = link_data[0]

        // * update link metadata
        const timeNow = new Date()
        const total_visited = link_data.total_visited + 1

        await sql.query('update urls set last_visited = ?, total_visited = ? where BINARY short_url = ?', [timeNow, total_visited, short_link])

        res.status(statusCode['200_ok']).json({
            errors: false, 
            message: 'success get short link',
            data: {
                short_url: link_data.short_url,
                long_url: link_data.long_url,
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

exports.post_link = async (req, res, next) => {

    let tx

    try {

        const val_err = validationResult(req)
        if(!val_err.isEmpty()) {
            throw_err(val_err.array()[0].msg, statusCode['400_bad_request'])
        }

        tx = await sql.getConnection()
        await tx.beginTransaction()

        const { long_url, is_custom } = req.body 
        let short_link_created

        if(is_custom) {
            // ! no need auth header check --> defined on routes

            // * if user is member -> user can send custom link -> but check if user is member or not -> if not member -> cannt use custom link
            if(req.is_member !== 1 ) {
                throw_err('Only member can use custom short link', statusCode['400_bad_request'])
            }

            // * check the short_link is already exist or not
            const { short_link } = req.body
            const is_short_link_exist = (await tx.query('select id, short_url from urls where BINARY short_url = ?', [short_link]))[0]
            if(is_short_link_exist.length > 0) {
                throw_err('Short link already exist, please choose another one', statusCode['400_bad_request'])
            }

            // * minimum shortlink 3 char
            if(short_link.trim().length <= 3) {
                throw_err('Minimum custom short link used 3 char', statusCode['400_bad_request'])
            }

            short_link_created = short_link.trim()

        } else {
            // * if using random short link -> have 2 possibility (1. user is non-member, or use feature non login) -> so check it first
            if(req.user_id && req.is_member !== 1) {
                // ! if hvve req.user_id -> so req is with user
                // * for check if non member user has max limit on short link 
                const USER_LINK_MAX = 10 // * max link for non member user
                const user_link = (await tx.query('select id, short_url from urls where user_id = ?', [req.user_id]))[0]

                if(user_link.length >= USER_LINK_MAX) {
                    throw_err('Max userlink reached, please delete 1 first', statusCode['400_bad_request'])
                }
            }

            // * create shorter link with random string and check if already exist in database
            let is_exist = true
            while(is_exist) {
                short_link_created = generate_random_string(7)
                const is_short_link_exist = (await tx.query('select id, short_url from urls where BINARY short_url = ?', [short_link_created]))[0]

                if(is_short_link_exist.length === 0) is_exist = false
            }

        }

        // * add new short url data
        const timeNow = new Date()
        const expiredTime = new Date(timeNow)
        expiredTime.setDate(timeNow.getDate() + 7) // ! FREE LINK will expired in 7 days -> if expired will be deleted
        let user_id = req.user_id ? req.user_id : null

        await tx.query("insert into urls (short_url, long_url, created_at, expired_at, is_active, total_visited, user_id) values (?, ?, ?, ?, ?, ?, ?)", [short_link_created, long_url, timeNow, expiredTime, 1, 0, user_id])

        await tx.commit()

        res.status(statusCode['200_ok']).json({
            errors: false, 
            message: 'success create new short link',
            data: {
                short_url: short_link_created
            }
        })

    } catch (e) {

        if(tx) {
            await tx.rollback()
            tx.release()
        }

        if(!e.statusCode) {
            e.statusCode = statusCode['500_internal_server_error']
        }

        next(e)
    }

}





// ! ------------------------ PATCH ------------------------ ! #

exports.edit_short_link = async (req, res, next) => {
    
    let tx
    
    try {

        tx = await sql.getConnection()
        await tx.beginTransaction()

        let { id_link, new_short_url } = req.body

        if(req.is_member !== 1) {
            throw_err('Only member can edit short link', statusCode['401_unauthorized'])
        }
        
        const is_exist = (await tx.query('select id, short_url, long_url, is_active, user_id from urls where id = ? limit 1', [id_link]))[0]
        if(is_exist.length === 0) {
            throw_err('Link not found', statusCode['404_not_found'])
        }

        const link_data = is_exist[0]
        if(link_data.user_id !== req.user_id) {
            throw_err('You dont have permission to edit this link', statusCode['401_unauthorized'])
        }

        new_short_url = new_short_url ? new_short_url.trim() : link_data.short_url // * when send new_short_url null --> set to be like old short url

        await tx.query('update urls set short_url = ? where id = ?', [new_short_url, id_link])

        await tx.commit()

        res.status(statusCode['200_ok']).json({
            errors: false,
            message: 'success edit short link data'
        })

    } catch (e) {

        if(tx.connection) {
            await tx.rollback()
            tx.release()
        }

        if(!e.statusCode) {
            e.statusCode = statusCode['500_internal_server_error']
        }

        next(e)
    }
}





// ! ------------------------ DELETE ------------------------ ! #

exports.delete_links = async (req, res, next) => {

    let tx 

    try {

        tx = await sql.getConnection()
        await tx.beginTransaction()

        const { id_link } = req.body

        const is_exist = (await tx.query('select id, short_url, is_active, user_id from urls where id = ? limit 1', [id_link]))[0]
        if(is_exist.length === 0) {
            throw_err('Link not found', statusCode['404_not_found'])
        }
        const link_data = is_exist[0]

        // * check if user is the owner of the link and have permission to delete it (or user is admin)
        if((link_data.user_id !== req.user_id) && (req.role !== 1)) {
            throw_err('You dont have permission to delete this link', statusCode['401_unauthorized'])
        }
        
        // * delete link data
        await tx.query('delete from urls where id = ?', [id_link])

        await tx.commit()

        res.status(statusCode['200_ok']).json({
            errors: false, 
            message: 'success delete short link data'
        })

    } catch (e) {

        if(tx.connection) {
            await tx.rollback()
            tx.release()
        }

        if(!e.statusCode) {
            e.statusCode = statusCode['500_internal_server_error']
        }

        next(e)
    }

}