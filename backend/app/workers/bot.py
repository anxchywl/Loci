import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
    InlineQuery,
    InlineQueryResultArticle,
    InputTextMessageContent,
    LinkPreviewOptions,
)

from app.core.config import get_settings
from app.db.session import get_session
from app.db.repositories import stories as stories_repo

logger = logging.getLogger(__name__)

dispatcher = Dispatcher()


@dispatcher.message(CommandStart())
async def handle_start(message: Message) -> None:
    settings = get_settings()
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Open Loci",
                    web_app=WebAppInfo(url=settings.telegram_mini_app_url),
                )
            ]
        ]
    )
    await message.answer("Pin your life moments to the map.", reply_markup=keyboard)


@dispatcher.inline_query()
async def handle_inline_query(inline_query: InlineQuery) -> None:
    settings = get_settings()
    share_token = inline_query.query.strip()
    
    if not share_token:
        await inline_query.answer([])
        return

    async for db in get_session():
        story = await stories_repo.get_by_share_token_discoverable(db, share_token)
        break # Only need one session
        
    if not story:
        await inline_query.answer([])
        return

    title = story["title"] or "A story on Loci"
    description = story["body"][:100] + ("..." if len(story["body"]) > 100 else "")
    
    app_url = f"{settings.telegram_mini_app_url}?startapp={share_token}"
    
    message_text = (
        f"<b>{title}</b>\n\n"
        f"{description}\n\n"
        f"<a href='{app_url}'>Open in Loci</a>"
    )
    
    result = InlineQueryResultArticle(
        id=share_token,
        title=title,
        description=description,
        input_message_content=InputTextMessageContent(
            message_text=message_text,
            parse_mode="HTML",
            link_preview_options=LinkPreviewOptions(is_disabled=True),
        ),
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="Open in Loci",
                        url=app_url,
                    )
                ]
            ]
        )
    )
    
    await inline_query.answer([result], cache_time=0)


async def main() -> None:
    settings = get_settings()
    if not settings.telegram_bot_token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN must be set to run the bot")
    if not settings.telegram_mini_app_url:
        raise RuntimeError("TELEGRAM_MINI_APP_URL must be set to run the bot")

    logging.basicConfig(level=settings.log_level)
    bot = Bot(token=settings.telegram_bot_token)
    logger.info("bot polling started")
    await dispatcher.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
