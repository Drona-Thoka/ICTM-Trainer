from flask import Flask

app = Flask(__name__)

@app.route("/")
def hello_world():
    return "<p>Hello, World!</p>"
@app.route("/get_amc")
def get_amc(diff:str):
    return "<p>Hello, World!</p>"
@app.route("/get_ictm")
def get_ictm(diff:str):
    return "<p>Hello, World!</p>"
@app.route("/get_nsml")
def get_nsml(diff:str):
    return "<p>Hello, World!</p>"
@app.route("/get_aime")
def get_aime(diff:str):
    return "<p>Hello, World!</p>"
@app.route("/get_arml")
def get_arml(diff:str):
    return "<p>Hello, World!</p>"
