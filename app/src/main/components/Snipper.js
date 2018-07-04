import React, {Fragment} from 'react';
import './Snipper.scss';
import Cropper from "./Cropper";

const {
    ipcRenderer,
    desktopCapturer,
    screen,
    shell, 
    remote,
} = require('electron');

const BrowserWindow = remote.BrowserWindow;
const dev = process.env.NODE_ENV === 'development';
const path = require('path');
const Jimp = require('jimp');
const screenSize = screen.getPrimaryDisplay().size;
const uuidv4 = require('uuid/v4');
const fs = require('fs');
const {post} = require('axios');

let snipWindow = null,
    mainWindow = null;

class Snipper extends React.Component{
    constructor(props){
        super(props);
        this.state = {
            view : this.getContext(),
            save_controls : false,
            image : '',
            upload_url : 'http://127.0.0.1:8989/upload'
        };
    }

    initCropper(e){
        mainWindow = this.getCurrentWindow();
        mainWindow.hide();

        snipWindow = new BrowserWindow({
            width: screenSize.width,
            height: screenSize.height,
            frame : false,
            transparent : true,
            kiosk: true
        });

        snipWindow.on('close', () => {
            snipWindow = null
        });

        ipcRenderer.once('snip', (event, data) => {
            this.captureScreen(data, null);
        });

        ipcRenderer.once('cancelled', (event) => {
            mainWindow.show();
        });

        snipWindow.loadURL(path.join('file://', __dirname, '/index.html') + '?snip');
        snipWindow.setResizable(false);
        //snipWindow.webContents.openDevTools();
    }

    getContext(){
        const context = global.location.search;
        return context.substr(1, context.length - 1);
    }

    getCurrentWindow(){
        return remote.getCurrentWindow();
    }

    getAllInstances(){
        return BrowserWindow.getAllWindows();
    }

    getMainInstance(){
        let instances = this.getAllInstances();
        return instances.filter((instance) => {
            return instance.id !== this.getCurrentWindow().id
        })[0];
    }

    destroyCurrentWindow(e){
        this.getCurrentWindow().close();
    }

    getScreenShot(callback, imageFormat) {
        let _this = this;
        this.callback = callback;
        imageFormat = imageFormat || 'image/png';

        this.handleStream = (stream) => {
            // Create hidden video tag
            let video_dom = document.createElement('video');
            video_dom.style.cssText = 'position:absolute;top:-10000px;left:-10000px;';
            // Event connected to stream
            video_dom.onloadedmetadata = function () {
                // Set video ORIGINAL height (screenshot)
                video_dom.style.height = this.videoHeight + 'px'; // videoHeight
                video_dom.style.width = this.videoWidth + 'px'; // videoWidth

                // Create canvas
                let canvas = document.createElement('canvas');
                canvas.width = this.videoWidth;
                canvas.height = this.videoHeight;
                let ctx = canvas.getContext('2d');
                // Draw video on canvas
                ctx.drawImage(video_dom, 0, 0, canvas.width, canvas.height);

                if (_this.callback) {
                    // Save screenshot to base64
                    _this.callback(canvas.toDataURL(imageFormat));
                } else {
                    console.log('Need callback!');
                }

                // Remove hidden video tag
                video_dom.remove();
                try {
                    // Destroy connect to stream
                    stream.getTracks()[0].stop();
                } catch (e) {}
            };
            video_dom.src = URL.createObjectURL(stream);
            document.body.appendChild(video_dom);
        };

        this.handleError = (e) => {
            console.log(e);
        };

        desktopCapturer.getSources({types: ['screen']}, (error, sources) => {
            if (error) throw error;
            for (let i = 0; i < sources.length; ++i) {
                // Filter: main screen
                if (sources[i].name === "Entire screen") {
                    navigator.webkitGetUserMedia({
                        audio: false,
                        video: {
                            mandatory: {
                                chromeMediaSource: 'desktop',
                                chromeMediaSourceId: sources[i].id,
                                minWidth: 1280,
                                maxWidth: 4000,
                                minHeight: 720,
                                maxHeight: 4000
                            }
                        }
                    }, this.handleStream, this.handleError);

                    return;
                }
            }
        });
    }

    captureScreen(coordinates,e){
        mainWindow = this.getCurrentWindow();
        mainWindow.hide();
    
        setTimeout(() => {
            
            this.getScreenShot((base64data) => {

                // add to buffer base64 image instead of saving locally in order to manipulate with Jimp
                let encondedImageBuffer = new Buffer(base64data.replace(/^data:image\/(png|gif|jpeg);base64,/,''), 'base64');
    
                Jimp.read(encondedImageBuffer, (err, image) => {
                    if (err) throw err;
    
                    let crop = coordinates ?
                                image.crop(coordinates.x, coordinates.y, parseInt(coordinates.width, 10), parseInt(coordinates.height, 10)) :
                                image.crop(0,0, screenSize.width, screenSize.height);
    
                    crop.getBase64('image/png', (err,base64data) =>{
                        this.setState({
                            image : base64data,
                            save_controls : true,
                        });
                        this.resizeWindowFor('snip');
                        mainWindow.show();
                    });
                });
            });
        }, 200);
    }

    snip(state, e){
        this.getMainInstance().webContents.send('snip', state);
        this.destroyCurrentWindow(null);
    }

    destroySnipView(e){
        this.getMainInstance().webContents.send('cancelled');
        this.destroyCurrentWindow(null);
    }

    resizeWindowFor(view){
        if(view === 'snip'){
            mainWindow.setSize(800, 500);
            let x = (screenSize.width/2) - 400;
            let y= (screenSize.height/2) - 250;
            mainWindow.setPosition(x,y);
        } else if(view === 'main') {
            const width = dev ? 800 : 400;
            const height = dev ? 800 : 200;
            mainWindow.setSize(width, height);
            let x = (screenSize.width/2) - width / 2;
            let y= (screenSize.height/2) - height / 2;
            mainWindow.setPosition(x,y);
        }
    }

    discardSnip(e){
        this.setState({
            image : '',
            save_controls : false,
        });
        this.resizeWindowFor('main');
    }

    saveToDisk(e){
        const directory = remote.app.getPath('pictures');
        const filepath = path.join(directory + '/' + uuidv4() + '.png');
        if (!fs.existsSync(directory)){
            fs.mkdirSync(directory);
        }
        fs.writeFile(filepath, this.state.image.replace(/^data:image\/(png|gif|jpeg);base64,/,''), 'base64', (err) => {
            if(err) console.log(err);
            shell.showItemInFolder(filepath);
            this.discardSnip(null);
        });
    }

    uploadAndGetURL(e){
        post(this.state.upload_url, {
            image : this.state.image
        })
        .then((response) => {
            const res = response.data;
            if(res.uploaded){
                shell.openExternal(this.state.upload_url + '/' + res.filename);
                this.discardSnip(null);
            }
        })
        .catch((error) => {
            console.log(error);
        });
    }

    render(){
        return(
            <Fragment>
            {this.state.view === 'main' ? (
                <Fragment>
                    <div className="snip-controls text-center">
                        <span
                            className="close"
                            title="close"
                            onClick={this.destroyCurrentWindow.bind(this)}>&times;
                        </span>

                        <div>
                            <h2>
                                <img height="25"
                                    src={require('../res/images/logo-big.png')}
                                    alt=""/>
                                Snipper
                            </h2>
                        </div>

                        {!this.state.save_controls ?
                            <div>
                                <button
                                    className="btn btn-primary mr-1"
                                    onClick={this.captureScreen.bind(this, null)}>
                                    Fullscreen
                                </button>

                                <button
                                    className="btn btn-primary mr-1"
                                    onClick={this.initCropper.bind(this)}>
                                    Crop Image
                                </button>
                            </div> :

                            <div>
                                <button
                                    className="btn btn-primary mr-1"
                                    onClick={this.saveToDisk.bind(this)}>
                                    Save to Disk
                                </button>

                                <button
                                    className="btn btn-primary mr-1"
                                    onClick={this.uploadAndGetURL.bind(this, null)}>
                                    Upload URL
                                </button>

                                <button
                                    className="btn btn-primary mr-1"
                                    onClick={this.discardSnip.bind(this)}>
                                    Discard
                                </button>

                            </div>
                        }
                    </div>

                    {this.state.image &&
                        <div className="snipped-image">
                            <img  className="preview" src={this.state.image} alt=""/>
                        </div>
                    }

                </Fragment>
            ) :
                <Cropper
                    snip={this.snip.bind(this)}
                    destroySnipView={this.destroySnipView.bind(this)}
                />
            }
            </Fragment>
        )
    }
}

export default Snipper;
