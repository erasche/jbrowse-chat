define([
    'dojo/_base/declare',
    'dojo/on',
    'dojo/dom',
    'dojo/dom-style',
    'dojo/dom-construct',
    'dijit/form/Button',
    'JBrowse/Plugin',
    "https://code.jquery.com/jquery-1.4.2.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/socket.io/1.3.6/socket.io.js",
],
function (
    declare,
    on,
    dom,
    domStyle,
    domConstruct,
    Button,
    JBrowsePlugin,
    jquery,
    io
) {
   return declare(JBrowsePlugin, {
        constructor: function (args) {
            var browser = args.browser;
            var self = this;

            this.config = {
                granularity: args.granularity,
                server: args.server,
                server_path: args.server_path,
                browser: args.browser,
                checkin_frequency: parseInt(args.checkin_frequency) || 5000,
            }
            console.log(this.config);

            this.userLocationMap = {};

            this.browser.afterMilestone('createTrack', function(){
                console.log('Chat plugin starting');
                self.initChatDiv();
                self.connectChat();
                console.log('Chat plugin ready');
            });

            window.Chat = this;
        },

        getRoom: function() {
            var room;
            if(this.config.granularity === 'refseq') {
                room = this.getLoc()['ref']
            } else {
                room = 'instance';
            }
            return room;
        },

        getLoc: function(){
            d = this.config.browser.view.visibleRegion();
            return {
                'ref': d['ref'],
                'start': parseInt(d['start']),
                'end': parseInt(d['end']),
            }
        },

        getLocStr: function(){
            return this.formatLoc(this.getLoc());
        },

        initChatDiv: function() {
            var gb = dom.byId("GenomeBrowser");
            // Change width, we'll fix it later.
            domStyle.set(gb, 'width', '80%');
            domStyle.set(gb, 'float', 'left');
            var body = document.getElementsByTagName('body')[0];
            domConstruct.place(
                '<div style="float: left;" id="chatBar">' +
                    '<div id="chatMenuBar" class="menuBar">' +
                        '<span class="dijit dijitReset dijitInline menu dijitDropDownButton">' +
                            '<span class="dijitReset dijitInline dijitButtonNode">' +
                                '<span class="dataset" style="user-select: none;">' +
                                    'Chat' +
                                '</span>' +
                                '<span id="shareButtonGoesHere">' +
                                    'Chat' +
                                '</span>' +
                            '</span>' +
                        '</span>' +
                    '</div>' +
                    '<div id="chatMain">' +
                        '<div id="chatArea" style="width:100%; overflow-y: scroll"></div>' +
                        '<input id="chatInput" style="width:100%" placeholder="Enter your message here">' +
                    '</div>' +
                '</div>', body, 'first')

            var myButton = new Button({
                iconClass: 'dijitEditorIconLink',
                label: "Share View",
                onClick: function(){
                    self.socket.emit('text', {
                        msg: '[location ' + self.getLocStr() + ']',
                        loc: self.getLoc(),
                        tracks: JBrowse.view.tracks.map(function(d){ return d.name  }),
                        room: self.getRoom(),
                    });
                }
            }, "shareButtonGoesHere").startup();
            // Fix sizes
            this.updateChatDivSize();
            // Forever
            var self = this;
            on(window, 'resize', function(){
                self.updateChatDivSize()
            })

            on(dom.byId('chatArea'), 'click', function(){
                dom.byId('chatInput').focus();
            })
        },

        updateChatDivSize: function() {
            chat_width = 300
            var width = window.innerWidth;
            var height = window.innerHeight;
            domStyle.set(dom.byId('chatBar'), 'width', chat_width + 'px');
            domStyle.set(dom.byId('chatBar'), 'height', height + 'px');
            domStyle.set(dom.byId('GenomeBrowser'), 'width', (width - chat_width - 30) + 'px');
            var chatMaxHeight = height - 10
                    - dojo.position(dom.byId('chatMenuBar')).h
                    - dojo.position(dom.byId('chatInput')).h;
            domStyle.set(dom.byId('chatArea'), 'height', chatMaxHeight + 'px');
        },

        updateBookmarks: function(){
            var new_bookmarks = [];
            for(var key in this.userLocationMap){
                new_bookmarks.push({
                    color: 'rgba(190,50,50,0.1)',
                    start: this.userLocationMap[key]['start'],
                    end: this.userLocationMap[key]['end'],
                    ref: this.userLocationMap[key]['ref'],
                })
            }
            JBrowse.config.bookmarks = new_bookmarks;
        },

        formatLoc: function(data){
            return data['ref'] + ':' + data['start'] + '..' + data['end'];
        },

        connectChat: function() {
            var self = this;
            // Per-refseq chat or per-instance chat?
            self.socket = io.connect(self.config.server + '/chat', {
                path: self.config.server_path + '/socket.io/',
                query: {
                    'room': self.getRoom()
                }
            })

            self.socket.on('connect', function() {
                self.socket.emit('joined', {
                    room: self.getRoom(),
                });
                self.registerPresenceUpdater();
            });

            self.socket.on('status', function(data) {
                self.handleStatus(data);
            });

            self.socket.on('message', function(data) {
                self.handleMessage(data);
            });

            $('#chatInput').keypress(function(e) {
                var code = e.keyCode || e.which;
                if (code == 13 && $('#chatInput').val().trim().length > 0) {
                    text = $('#chatInput').val();
                    $('#chatInput').val('');
                    self.socket.emit('text', {
                        msg: text,
                        room: self.getRoom(),
                        loc: self.getLoc(),
                        tracks: JBrowse.view.tracks.map(function(d){ return d.name  }),
                    });
                }
            });

            $(window).unload(function(){
                self.socket.emit('left', {room: self.getRoom()}, function() {
                    socket.disconnect();
                });
            });
        },

        registerPresenceUpdater: function(data){
            var self = this;
            // Regularly share locations. This probably doesn't scale well, currently.
            setInterval(function(){
                self.socket.emit('text', {
                    msg: '[location quiet ' + self.getLocStr() + ']',
                    room: self.getRoom(),
                    loc: self.getLoc(),
                    tracks: JBrowse.view.tracks.map(function(d){ return d.name  }),
                });
            }, this.config.checkin_frequency);
        },

        handleMessage: function(data){
            $("#chatArea").append(
                '<div class="message">' +
                    '<div class="avatar">' +
                        '<img width="50" src="' + data.user.picture + '">' +
                    '</div>' +
                    '<div class="body">' +
                        '<div class="author">' + data.user.name + '</div>' +
                        '<div class="text">' + data.msg + '</div>' +
                    '</div>' +
                '</div>'
            );
            if($('#chatArea')){
                $('#chatArea').scrollTop($('#chatArea')[0].scrollHeight);
            }
        },

        jumpTo: function(encodedData){
            data = JSON.parse(decodeURIComponent(escape(atob(encodedData))))
            console.log(data);
            JBrowse.navigateTo(this.formatLoc(data.loc))
            // Then flip off tracks so ours can be in the SAME order as theirs
            for(var k in JBrowse.view.tracks){
                this.browser.publish('/jbrowse/v1/v/tracks/hide', [JBrowse.view.tracks[k].config]);
            }
            // Reformat known tracks into an addressable structure
            //
            var trackMap = JBrowse.config.tracks.reduce(function(map, obj) {
                map[obj.label] = obj;
                return map;
            }, {});

            // Now, in order, we flip those tracks on.
            for(var k in data.tracks){
                this.browser.publish('/jbrowse/v1/v/tracks/show', [trackMap[data.tracks[k]]]);
            }
        },

        handleStatus: function(data){
            var self = this;
            if(data.msg) {
                if(data.msg.substring(0, 10) === '[location '){
                    if(data.msg.substring(0, 16) === '[location quiet '){
                        // Just register the updated position.
                        self.userLocationMap[data.user.id] = data.loc
                        self.updateBookmarks();
                    } else {

                        $("#chatArea").append(
                            '<div class="status location" onclick="Chat.jumpTo(\'' + btoa(unescape(encodeURIComponent(JSON.stringify(data)))) + '\')">' +
                                '<div class="body">' +
                                    '<div class="author">' + data.user.name + ' shared a location ' + self.formatLoc(data.loc) + '</div>' +
                                '</div>' +
                            '</div>'
                        );
                    }
                } else {
                    $("#chatArea").append('<div class="status"><div class="body">' + data.msg + "</div></div>");
                }
                $('#chatArea').scrollTop($('#chatArea')[0].scrollHeight);
            } else {
                if(data.err === "Unauthenticated"){
                    $('#chatArea').append(
                        '<a id="loginButton" href="' + self.config.server + '/login">Login with Google</a>'
                    );
                    //
                } else {
                    console.log(data);
                }
            }
        },
    });
});
