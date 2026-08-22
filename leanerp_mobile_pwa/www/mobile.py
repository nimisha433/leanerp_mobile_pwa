import frappe


def get_context(context):
	# Calling this (rather than reading session data directly) has the side effect of generating and
	# storing the token if this session has never had one — same as frappe/www/app.py does for Desk.
	# Without it, the `<!-- csrf_token -->` marker below gets substituted with the literal string
	# "None" for any session that never went through the desk boot process (e.g. a bare API login).
	frappe.sessions.get_csrf_token()
