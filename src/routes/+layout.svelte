<script>
    let { children } = $props();
</script>

<style>
    .main {
        width: 100%;
        min-height: 100vh;
        overflow-x: hidden;
        display: flex;
        text-align: center;
        flex-direction: column;
        background-color: rgb(47, 47, 47);
        color: white;
    }
</style>

<div class="main">
    {@render children()}
</div>