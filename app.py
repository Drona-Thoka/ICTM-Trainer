from flask import Flask

app = Flask(__name__)

@app.route("/")
def hello_world():
    return "<p>Hello, World!</p>"

@app.route("/get_amc/<diff>")
def get_amc(diff:str):
    return "<p>Hello, World!</p>"

@app.route("/get_ictm/<event>/<diff>")
def get_ictm(event:str, diff:str):
    return "<p>Hello, World!</p>"

@app.route("/get_nsml/<event>/<diff>")
def get_nsml(event:str, diff:str):
    return "<p>Hello, World!</p>"

@app.route("/get_aime/<diff>")
def get_aime(diff:str):
    return "<p>Hello, World!</p>"

@app.route("/get_arml/<diff>")
def get_arml(diff:str):
    return "<p>Hello, World!</p>"

@app.route("/amc_solutions/<problem>")
def amc_solutions(problem:int):
    return "<p>Hello, World!</p>"

@app.route("/aime_solutions/<problem>")
def aime_solutions(problem:int):
    return "<p>Hello, World!</p>"

@app.route("/nsml_solutions/<problem>")
def nsml_solutions(problem:int):
    return "<p>Hello, World!</p>"

@app.route("/ictm_solutions/<problem>")
def ictm_solutions(problem:int):
    return "<p>Hello, World!</p>"

@app.route("/arml_solutions/<problem>")
def arml_solutions(problem:int):
    return "<p>Hello, World!</p>"