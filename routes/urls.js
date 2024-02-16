const router = require('express').Router();
const linksController = require('../controllers/linksControllers')
const is_auth = require('../middleware/is-auth')
const is_admin = require('../middleware/role-checking').is_admin

// * ------------------------- ROUTING ------------------------- * //

router.get('/', is_auth, is_admin, linksController.get_all_links)

router.get('/:short_url', linksController.get_link)

router.post('/', linksController.post_link)

router.patch('/', is_auth, linksController.edit_short_link)

router.delete('/', is_auth, linksController.delete_links)

module.exports = router