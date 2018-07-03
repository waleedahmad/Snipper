const express = require('express')
const app = express()
const bodyParser = require('body-parser');
const fs = require('fs');
const uuidv4 = require('uuid/v4');
const path = require('path');
const port = 8989;

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json({limit: '10000kb'}));

app.use('/upload', express.static(path.join(__dirname, 'uploads')));

app.post('/upload', (req, res) => {
    const image = req.body.image;
    const directory = path.join(__dirname + '/uploads');
    const filename = uuidv4() + '.png';
    const filepath = path.join(directory + '/' + filename);
    if (!fs.existsSync(directory)){
        fs.mkdirSync(directory);
    }
    fs.writeFile(filepath, image.replace(/^data:image\/(png|gif|jpeg);base64,/,''), 'base64', (err) => {
        if(err) console.log(err);
        res.json({
            uploaded : true,
            filename : filename
        })
    });

});

app.listen(port, () => {
    console.log('Server running on PORT: ' + port);
});