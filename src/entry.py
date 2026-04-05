from js import Response, fetch, Headers
import json

class WorkerEntrypoint:
    def __init__(self, ctx, env):
        self.ctx = ctx
        self.env = env

    async def fetch(self, request):
        if request.method != "POST":
            return Response.new("Method Not Allowed", status=405)

        try:
            # Parse the incoming JSON request from Telegram Webhook
            text = await request.text()
            update = json.loads(text)

            if "inline_query" in update:
                await self.handle_inline_query(update["inline_query"])
            elif "callback_query" in update:
                await self.handle_callback_query(update["callback_query"])

            return Response.new("OK", status=200)

        except Exception as e:
            print(f"Error processing webhook: {e}")
            return Response.new("Internal Server Error", status=500)

    async def send_telegram_request(self, method, payload):
        """Helper to send JSON payloads to the Telegram Bot API."""
        bot_token = self.env.BOT_TOKEN
        url = f"https://api.telegram.org/bot{bot_token}/{method}"
        
        headers = Headers.new({"content-type": "application/json"})
        options = {
            "method": "POST",
            "headers": headers,
            "body": json.dumps(payload)
        }
        
        return await fetch(url, options)

    async def handle_inline_query(self, inline_query):
        """Respond with a 'game' type result."""
        query_id = inline_query.get("id")
        
        payload = {
            "inline_query_id": query_id,
            "results": [{
                "type": "game",
                "id": "1",
                "game_short_name": self.env.GAME_SHORT_NAME
            }]
        }
        await self.send_telegram_request("answerInlineQuery", payload)

    async def handle_callback_query(self, callback_query):
        """Respond with the GAME_URL when the 'Play' button is clicked."""
        query_id = callback_query.get("id")
        
        payload = {
            "callback_query_id": query_id,
            "url": self.env.GAME_URL
        }
        await self.send_telegram_request("answerCallbackQuery", payload)

# Python Workers exporting default class
export = WorkerEntrypoint