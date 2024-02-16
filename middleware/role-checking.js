const statusCode = require('../utils/http-response').httpStatus_keyValue

function throw_err(msg, code) {
    const err = new Error(msg)
    err.statusCode = code 
    throw err
}


exports.is_admin = async (req, res, next) => {
    try {
        if(req.role !== 1) {
            throw_err('You are not authorized (not admin)', statusCode['401_unauthorized'])
        }

        next()

    } catch(e) {
        if(!e.statusCode) {
            e.statusCode = statusCode['500_internal_server_error']
        }
        
        next(e)
    }
}


exports.is_user = async (req, res, next) => {
    try {
        if(req.role !== 2) {
            throw_err('You are not authorized (not user)', statusCode['401_unauthorized'])
        }

        next()

    } catch(e) {
        if(!e.statusCode) {
            e.statusCode = statusCode['500_internal_server_error']
        }

        next(e)
    }
}