from flask import Flask, jsonify, request

import pickle
import numpy as np



app = Flask(__name__)

@app.route('/')
def hello_world():
    return 'hi'
@app.route('/bye/<name>')
def bye(name):  
     return f'bye {name}'
if __name__ == '__main__':
    app.run(debug=True)

