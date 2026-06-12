from flask import Flask

app = Flask(__name__)

@app.route("/")
def hello_world():
    return "<p>Hello, World!</p>"

@app.route("/get_amc/<diff>")
def get_amc(diff:str):
    return "<p>Hello, World!</p>"

@app.route("/get_ictm/<diff>")
def get_ictm(diff:str):
    return "<p>Hello, World!</p>"

@app.route("/get_nsml/<diff>")
def get_nsml(diff:str):
    return "<p>Hello, World!</p>"

@app.route("/get_aime/<diff>")
def get_aime(diff:str):
    return "<p>Hello, World!</p>"

@app.route("/get_arml/<diff>")
def get_arml(diff:str):
    return "<p>Hello, World!</p>"
