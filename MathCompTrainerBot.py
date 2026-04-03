import discord
from discord.ext import commands

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix='$', intents=intents)

//example command
@bot.command()
async def test(ctx, args):
    await ctx.send(args)


bot.add_command(test)
