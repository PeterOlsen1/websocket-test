<style>
    .main {
        height: 100vh;
        background-color: white;
        color: black;
    }
    .body {
        display: grid;
        width: 100%;
        height: 50vh;
        place-items: center;
        background-color: white;
        color: black;
    }

    .svg-wrapper {
        height: 9rem;
        background-color: white;
    }

    .header {
        background-color: rgb(47, 47, 47);
        color: white;
        display: flex;
        padding-top: 1em;
    }

    .header-left {
        font-size: 2em;
        font-weight: 600;
        padding-left: 1em;
        cursor: pointer;
    }

    .header-right {
        flex: 1;
        display: flex;
        justify-content: flex-end;
        padding-right: 1em;
        gap: 1em;
        align-items: center;
    }

    a, a:visited {
        color: black;
    }
</style>


<div class="main">
    <div class="header">
        <div class="header-left">
            Peter's Zoom.
        </div>
        <div class="header-right">
            Call ended
        </div>
    </div>
    <div class="svg-wrapper">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320">
            <path fill="rgb(47, 47, 47)" fill-opacity="1" d="M0,160L34.3,149.3C68.6,139,137,117,206,117.3C274.3,117,343,139,411,149.3C480,160,549,160,617,149.3C685.7,139,754,117,823,112C891.4,107,960,117,1029,112C1097.1,107,1166,85,1234,85.3C1302.9,85,1371,107,1406,117.3L1440,128L1440,0L1405.7,0C1371.4,0,1303,0,1234,0C1165.7,0,1097,0,1029,0C960,0,891,0,823,0C754.3,0,686,0,617,0C548.6,0,480,0,411,0C342.9,0,274,0,206,0C137.1,0,69,0,34,0L0,0Z"></path>
        </svg>
    </div>

    <div class="body">
        <div>
            <div class="header-left" style="padding-left: 0">
                The host ended your call.
            </div>
            <br>
            <div>
                Don't worry! You can join another.
                <br>
                Head back home <a href="/">here</a>.
            </div>
        </div>
    </div>
</div>