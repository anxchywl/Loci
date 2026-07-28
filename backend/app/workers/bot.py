import asyncio
import logging
from contextlib import aclosing

from aiogram import Bot, Dispatcher
from aiogram.filters import CommandObject, CommandStart
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
from app.core.security.telegram import TelegramUserData
from app.db.session import get_session
from app.db.repositories import stories as stories_repo
from app.integrations.redis import get_redis_client
from app.modules.auth import linking as linking_service
from app.modules.auth import telegram_link as telegram_link_service
from app.modules.auth.linking import LinkError

logger = logging.getLogger(__name__)

dispatcher = Dispatcher()


def _open_app_keyboard() -> InlineKeyboardMarkup:
    settings = get_settings()
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Open Loci",
                    web_app=WebAppInfo(url=settings.telegram_mini_app_url),
                )
            ]
        ]
    )


def _sender_profile(message: Message) -> TelegramUserData:
    sender = message.from_user
    return TelegramUserData(
        telegram_id=sender.id,
        username=sender.username,
        first_name=sender.first_name,
        last_name=sender.last_name,
        photo_url=None,
        language_code=sender.language_code,
    )


@dispatcher.message(CommandStart(deep_link=True))
async def handle_start_link(message: Message, command: CommandObject) -> None:
    """Redeem an account-link token carried by `/start <token>`.

    The token proves which Loci account asked for the link, so pressing Start is
    the whole confirmation — there is nothing further to type or approve.
    """
    if message.from_user is None:
        return
    user_id = await telegram_link_service.consume_token(
        get_redis_client(), (command.args or "").strip()
    )
    if user_id is None:
        # an unknown payload is also how a story deep link arrives; those open
        # the app rather than failing
        await handle_start(message)
        return

    profile = _sender_profile(message)
    try:
        # aclosing, not a bare break: the generator owns the session, and a
        # long-lived bot must hand each connection back to the pool right away
        async with aclosing(get_session()) as sessions:
            async for db in sessions:
                await linking_service.link_telegram(db, user_id, profile)
                break
    except LinkError as exc:
        await message.answer(str(exc), reply_markup=_open_app_keyboard())
        return
    except Exception:
        logger.exception("telegram account link failed")
        await message.answer(
            "Something went wrong connecting your account. Please try again.",
            reply_markup=_open_app_keyboard(),
        )
        return

    await message.answer(
        "Telegram is connected. Head back to Loci — you're already signed in.",
        reply_markup=_open_app_keyboard(),
    )


@dispatcher.message(CommandStart())
async def handle_start(message: Message) -> None:
    await message.answer(
        "Pin your life moments to the map.", reply_markup=_open_app_keyboard()
    )


@dispatcher.inline_query()
async def handle_inline_query(inline_query: InlineQuery) -> None:
    settings = get_settings()
    share_token = inline_query.query.strip()
    
    if not share_token:
        await inline_query.answer([])
        return

    async with aclosing(get_session()) as sessions:
        async for db in sessions:
            story = await stories_repo.get_by_share_token_discoverable(db, share_token)
            break

    if not story:
        await inline_query.answer([])
        return

    title = story["title"] or "A story on Loci"
    description = story["body"][:100] + ("..." if len(story["body"]) > 100 else "")
    
    # a plain web link: it opens in a browser for anyone, in or out of Telegram
    app_url = f"{settings.telegram_mini_app_url.rstrip('/')}/?s={share_token}"
    
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
