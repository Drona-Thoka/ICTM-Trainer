import discord
from discord.ext import commands

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix='/', intents=intents)

//Example command
@bot.command()
async def test(ctx, args):
    await ctx.send(args)
//Actual Commands
@bot.command()
async def practiceProblem(ctx, comp, tpc, diff):
    //logic
    pass
    
async def practiceTest(ctx, amt, tpc, diff):
    //logic
    pass

bot.add_command(practiceProblem)
